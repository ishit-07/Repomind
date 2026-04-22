import express from 'express';
import { processRepository } from '../services/github.js';
import { chunkText } from '../utils/chunk.js';
import { generateEmbedding } from '../services/gemini.js';
import { streamAnswer, generateSuggestions, generateSummary } from '../services/rag.js';
import { RepoDocument } from '../models/RepoDocument.js';
import { RepoFile } from '../models/RepoFile.js';
import { buildDependencyGraph } from '../services/dependencyParser.js';

const router = express.Router();

import { RepoMeta } from '../models/RepoMeta.js';

// POST /api/ingest — fetch, chunk, embed and store a GitHub repo
router.post('/ingest', async (req, res) => {
    const { repoUrl } = req.body;

    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }

    console.log(`Starting ingestion for: ${repoUrl}`);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    try {
        sendEvent({ status: 'fetching_github', message: 'Checking repository...' });

        // Step 1: Process Repo and Check Cache
        const { commitSha, downloadedFiles } = await processRepository(repoUrl, (progress) => {
            if (progress.type === 'download_progress') {
                sendEvent({ status: 'fetching_github', progress: progress.current, total: progress.total, message: `Downloading files (${progress.current}/${progress.total})` });
            }
        });

        const cachedMeta = await RepoMeta.findOne({ repoUrl, commitSha, status: 'complete' });
        if (cachedMeta) {
            console.log(`Cache hit for ${repoUrl} at ${commitSha}`);
            
            const filesProcessed = await RepoFile.countDocuments({ repoUrl });
            const chunksCreated = await RepoDocument.countDocuments({ repoUrl });

            sendEvent({ status: 'graph_ready', data: cachedMeta.graphData });
            sendEvent({ status: 'suggestions_ready', data: cachedMeta.suggestions });
            sendEvent({ status: 'complete', message: 'Loaded from cache', filesProcessed, chunksCreated });
            return res.end();
        }

        // Setup Meta for new ingest
        await RepoMeta.deleteMany({ repoUrl });
        const meta = new RepoMeta({ repoUrl, commitSha, status: 'pending' });
        await meta.save();

        await RepoDocument.deleteMany({ repoUrl });
        await RepoFile.deleteMany({ repoUrl });

        // Save raw files for AST
        sendEvent({ status: 'parsing_ast', message: 'Saving files and building dependency graph...' });
        for (const file of downloadedFiles) {
            await new RepoFile({ repoUrl, filePath: file.path, content: file.content }).save();
        }

        // Step 2: Build Dependency Graph (before embeddings!)
        const graphData = await buildDependencyGraph(repoUrl);
        meta.graphData = graphData;
        await meta.save();
        sendEvent({ status: 'graph_ready', data: graphData });

        // Step 3: Chunk & Embed Concurrently
        let allChunks = [];
        for (const file of downloadedFiles) {
            const chunks = chunkText(file.content);
            for (let i = 0; i < chunks.length; i++) {
                allChunks.push({ file, chunkContent: chunks[i], index: i });
            }
        }

        sendEvent({ status: 'embedding', progress: 0, total: allChunks.length, message: `Generating embeddings (0/${allChunks.length})` });

        const BATCH_SIZE = 10;
        let processedChunks = 0;
        let successChunks = 0;

        for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
            const batch = allChunks.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async ({ file, chunkContent, index }) => {
                try {
                    const embedding = await generateEmbedding(chunkContent);
                    const doc = new RepoDocument({
                        repoUrl,
                        filePath: file.path,
                        content: chunkContent,
                        chunkIndex: index,
                        embedding
                    });
                    await doc.save();
                    successChunks++;
                } catch (err) {
                    console.error(`Failed to embed chunk ${index} of ${file.path}`, err);
                }
                processedChunks++;
                if (processedChunks % 5 === 0 || processedChunks === allChunks.length) {
                    sendEvent({ status: 'embedding', progress: processedChunks, total: allChunks.length, message: `Generating embeddings (${processedChunks}/${allChunks.length})` });
                }
            });

            await Promise.all(promises);
        }

        // Step 4: Generate Suggestions
        sendEvent({ status: 'generating_suggestions', message: 'Analyzing code for suggestions...' });
        const suggestions = await generateSuggestions(repoUrl);
        meta.suggestions = suggestions;
        
        sendEvent({ status: 'suggestions_ready', data: suggestions });

        // Complete
        meta.status = 'complete';
        await meta.save();
        sendEvent({ status: 'complete', message: 'Ingestion successful', filesProcessed: downloadedFiles.length, chunksCreated: successChunks });
        res.end();

    } catch (error) {
        console.error('Ingestion failed:', error);
        sendEvent({ status: 'error', error: error.message });
        res.end();
    }
});

// POST /api/chat — streaming SSE chat with multi-turn history
router.post('/chat', async (req, res) => {
    const { repoUrl, question, history = [] } = req.body;

    if (!repoUrl || !question) {
        return res.status(400).json({ error: 'repoUrl and question are required' });
    }

    // Set SSE headers before streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
        await streamAnswer(repoUrl, question, history, res);
    } catch (error) {
        console.error('Chat failed:', error);
        res.write(`data: ${JSON.stringify({ error: 'Failed to generate answer: ' + error.message })}\n\n`);
        res.end();
    }
});

// GET /api/suggestions?repoUrl=... — generate starter questions
router.get('/suggestions', async (req, res) => {
    const { repoUrl } = req.query;

    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }

    try {
        const suggestions = await generateSuggestions(repoUrl);
        res.json({ suggestions });
    } catch (error) {
        console.error('Suggestions failed:', error);
        res.status(500).json({ suggestions: [] });
    }
});

// GET /api/summary?repoUrl=... — generate AI repo overview
router.get('/summary', async (req, res) => {
    const { repoUrl } = req.query;
    if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

    try {
        const summary = await generateSummary(repoUrl);
        res.json({ summary });
    } catch (error) {
        console.error('Summary failed:', error);
        res.status(500).json({ summary: null });
    }
});

// GET /api/structure?repoUrl=... — return AST-based dependency graph and file tree
router.get('/structure', async (req, res) => {
    const { repoUrl } = req.query;
    if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

    try {
        const structure = await buildDependencyGraph(repoUrl);
        res.json(structure);
    } catch (error) {
        console.error('Structure building failed:', error);
        res.status(500).json({ error: 'Failed to build dependency graph: ' + error.message });
    }
});
// GET /api/file?repoUrl=...&filePath=... — return raw file content
router.get('/file', async (req, res) => {
    const { repoUrl, filePath } = req.query;
    if (!repoUrl || !filePath) return res.status(400).json({ error: 'repoUrl and filePath are required' });

    try {
        const file = await RepoFile.findOne({ repoUrl, filePath });
        if (!file) return res.status(404).json({ error: 'File not found in ingested repository' });

        res.json({
            repoUrl,
            filePath: file.filePath,
            content: file.content
        });
    } catch (error) {
        console.error('File fetch failed:', error);
        res.status(500).json({ error: 'Failed to fetch file: ' + error.message });
    }
});

export default router;
