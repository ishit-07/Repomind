import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;

/**
 * Generate an embedding array [number] for a given text using the Gemini REST API.
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
    try {
        const response = await fetch(EMBED_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text }] },
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(JSON.stringify(err));
        }

        const data = await response.json();
        return data.embedding.values;
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}
