import dotenv from 'dotenv';
import { RepoDocument } from '../models/RepoDocument.js';
import { generateEmbedding } from './gemini.js';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find the most relevant code chunks using in-memory cosine similarity.
 */
export async function findRelevantChunks(repoUrl, queryEmbedding, limit = 8) {
    const docs = await RepoDocument.find(
        { repoUrl },
        { filePath: 1, content: 1, embedding: 1 }
    ).lean();

    if (docs.length === 0) return [];

    const scored = docs.map(doc => ({
        filePath: doc.filePath,
        content: doc.content,
        score: cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}

/**
 * Build the Gemini `contents` array from code context + chat history.
 * Supports multi-turn conversation by including previous messages.
 */
function buildContents(contextString, chatHistory, currentQuestion, repoUrl) {
    const systemPrompt = `You are RepoMind, an expert AI developer assistant helping a user explore a specific GitHub repository.

Repository URL: ${repoUrl}

Your behaviour rules:
1. For questions about the CODE (architecture, functions, files, logic, dependencies): answer using the provided code context below. Reference specific file names when relevant.
2. For questions about code flow, architecture diagrams, or workflows (e.g., "what is the login flow?" or "how does x communicate with y?"): ALWAYS provide a Mermaid.js flowchart or sequence diagram to visualize it. Wrap the diagram in a \`\`\`mermaid code block.
3. For general developer questions (how to clone, how to install, how to run, git commands, etc.): answer helpfully using the repo URL above and common developer knowledge — you don't need the code context for these.
4. Never hallucinate file names, functions, or code that are not in the context.
5. Always format code examples in markdown code blocks with the correct language (e.g. \`\`\`bash, \`\`\`js).
6. Be concise and direct. Developers prefer short, accurate answers.

${contextString}`;

    const contents = [
        // First turn: inject the system context as a user message
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I have read the codebase context and I am ready to help. What would you like to know?' }] },
        // Replay the existing chat history
        ...chatHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        })),
        // Current question
        { role: 'user', parts: [{ text: currentQuestion }] }
    ];

    return contents;
}

/**
 * Stream the AI answer token by token, writing SSE chunks to the Express response.
 * @param {string} repoUrl
 * @param {string} question
 * @param {Array} chatHistory - previous messages [{role, content}]
 * @param {import('express').Response} res - Express response to stream to
 */
export async function streamAnswer(repoUrl, question, chatHistory, res) {
    // 1. Convert question to embedding
    const questionEmbedding = await generateEmbedding(question);

    // 2. Find relevant code chunks
    const chunks = await findRelevantChunks(repoUrl, questionEmbedding, 8);

    let contextString = '';
    if (chunks.length === 0) {
        contextString = 'No relevant code chunks found. Tell the user to make sure the repository has been ingested.';
    } else {
        contextString = "Here are the most relevant code snippets from the repository:\n\n";
        chunks.forEach(chunk => {
            contextString += `--- File: ${chunk.filePath} ---\n${chunk.content}\n\n`;
        });
    }

    // 3. Build multi-turn contents
    const contents = buildContents(contextString, chatHistory, question, repoUrl);

    // 4. Stream from Gemini
    const geminiRes = await fetch(STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
    });

    if (!geminiRes.ok) {
        const err = await geminiRes.json();
        throw new Error(JSON.stringify(err));
    }

    // 5. Pipe SSE chunks to the client
    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line in buffer

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    // Send each token as a simple SSE event
                    res.write(`data: ${JSON.stringify({ token: text })}\n\n`);
                }
            } catch (_) { /* skip malformed chunks */ }
        }
    }

    res.write('data: [DONE]\n\n');
    res.end();
}

/**
 * Generate 4 suggested starter questions based on the repository files.
 */
export async function generateSuggestions(repoUrl) {
    // Sample up to 5 files to give the model context
    const docs = await RepoDocument.find({ repoUrl }, { filePath: 1, content: 1 }).limit(5).lean();

    if (docs.length === 0) return [];

    const sampleContext = docs.map(d => `File: ${d.filePath}\n${d.content.slice(0, 300)}`).join('\n\n');

    const prompt = `Based on the following code from a GitHub repository, generate exactly 4 concise, interesting questions a developer might ask about this codebase. Return ONLY a JSON array of 4 strings, no other text.

${sampleContext}

Return format: ["question 1", "question 2", "question 3", "question 4"]`;

    const response = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7 }
        }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    try {
        // Extract JSON array from the response text
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
    } catch (_) { }

    return [];
}
/**
 * Generate an AI summary of the repository to show as the first chat message.
 */
export async function generateSummary(repoUrl) {
    // Sample a spread of files for context (README first if available)
    const docs = await RepoDocument.find(
        { repoUrl },
        { filePath: 1, content: 1 }
    ).limit(12).lean();

    if (docs.length === 0) return null;

    // Sort so README/package.json come first
    docs.sort((a, b) => {
        const priority = (p) => {
            if (/readme/i.test(p)) return 0;
            if (/package\.json/.test(p)) return 1;
            if (/index\.[jt]s/.test(p)) return 2;
            return 3;
        };
        return priority(a.filePath) - priority(b.filePath);
    });

    const context = docs.map(d => `File: ${d.filePath}\n${d.content.slice(0, 400)}`).join('\n\n---\n\n');

    const prompt = `You are RepoMind, analyzing a GitHub repository. Based on the following code and files, write a concise, developer-friendly summary of this repository.

Include:
- What the project does (1-2 sentences)
- Main tech stack / language
- Key features or modules (bullet points, max 5)
- Any notable patterns (e.g., REST API, microservices, CLI tool)

Keep it under 200 words. Use markdown formatting. Be direct and specific — no fluff.

Repository files:
${context}`;

    const response = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 400 }
        }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}
