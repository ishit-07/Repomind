/**
 * Splits a large string (file content) into chunks of a maximum length.
 * Extremely simple chunker for MVP: splits by lines to avoid cutting tokens mid-word.
 * 
 * @param {string} text - The code content to split.
 * @param {number} maxChars - Approximate maximum characters per chunk (default 2000).
 * @param {number} overlapChars - Approximate overlap characters to retain context (default 200).
 * @returns {string[]} An array of text chunks.
 */
export function chunkText(text, maxChars = 2000, overlapChars = 200) {
    if (!text || text.trim().length === 0) return [];

    const chunks = [];
    let startIndex = 0;

    while (startIndex < text.length) {
        let endIndex = startIndex + maxChars;

        if (endIndex >= text.length) {
            chunks.push(text.slice(startIndex));
            break;
        }

        // Try to find a logical break near the endIndex (like a newline)
        let breakIndex = text.lastIndexOf('\n', endIndex);

        // If no newline is found within the chunk, just strictly cut it
        if (breakIndex <= startIndex) {
            breakIndex = endIndex;
        }

        chunks.push(text.slice(startIndex, breakIndex));

        // Move start pointer forward, but go back overlapChars to maintain context
        startIndex = breakIndex - overlapChars;
        if (startIndex < 0) startIndex = 0;
    }

    return chunks.filter(c => c.trim().length > 0);
}
