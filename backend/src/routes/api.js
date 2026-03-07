import express from 'express';
import { processRepository } from '../services/github.js';
import { chunkText } from '../utils/chunk.js';
import { generateEmbedding } from '../services/gemini.js';
import { streamAnswer, generateSuggestions, generateSummary } from '../services/rag.js';
import { RepoDocument } from '../models/RepoDocument.js';

const router = express.Router();

// POST /api/ingest — fetch, chunk, embed and store a GitHub repo
router.post('/ingest', async (req, res) => {
    const { repoUrl } = req.body;

    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }

    console.log(`Starting ingestion for: ${repoUrl}`);

    try {
        const files = await processRepository(repoUrl);
        await RepoDocument.deleteMany({ repoUrl });

        let totalChunks = 0;

        for (const file of files) {
            const chunks = chunkText(file.content);

            for (let i = 0; i < chunks.length; i++) {
                const chunkContent = chunks[i];
                try {
                    const embedding = await generateEmbedding(chunkContent);
                    const doc = new RepoDocument({
                        repoUrl,
                        filePath: file.path,
                        content: chunkContent,
                        chunkIndex: i,
                        embedding
                    });
                    await doc.save();
                    totalChunks++;
                } catch (embeddingError) {
                    console.error(`Failed to embed chunk ${i} of ${file.path}`, embeddingError);
                }
            }
        }

        res.json({
            message: 'Ingestion complete',
            filesProcessed: files.length,
            chunksCreated: totalChunks,
            repoUrl
        });

    } catch (error) {
        console.error('Ingestion failed:', error);
        res.status(500).json({ error: 'Ingestion failed: ' + error.message });
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

export default router;
