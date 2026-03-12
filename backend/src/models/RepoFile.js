import mongoose from 'mongoose';

const repoFileSchema = new mongoose.Schema({
    repoUrl: { type: String, required: true, index: true },
    filePath: { type: String, required: true },
    content: { type: String, required: true }
}, { timestamps: true });

// Compound index for fast lookups of specific files in a repo
repoFileSchema.index({ repoUrl: 1, filePath: 1 }, { unique: true });

export const RepoFile = mongoose.model('RepoFile', repoFileSchema);
