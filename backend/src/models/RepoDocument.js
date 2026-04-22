import mongoose from 'mongoose';

const repoDocumentSchema = new mongoose.Schema({
    repoUrl: { type: String, required: true, index: true },
    filePath: { type: String, required: true },
    content: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    embedding: { type: [Number], required: true }
}, { timestamps: true });

// Note: Mongoose `index: true` above creates a standard index on repoUrl.

// Defining the vector search index configuration in Atlas:
// Name: vector_index
// Type: vectorSearch
// Fields:
//   - type: vector
//   - path: embedding
//   - numDimensions: 768
//   - similarity: cosine

export const RepoDocument = mongoose.model('RepoDocument', repoDocumentSchema);
