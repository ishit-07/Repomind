import mongoose from 'mongoose';

const repoMetaSchema = new mongoose.Schema({
    repoUrl: { type: String, required: true, index: true },
    commitSha: { type: String, required: true },
    status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'pending' },
    graphData: { type: mongoose.Schema.Types.Mixed, default: null },
    suggestions: { type: [String], default: [] }
}, { timestamps: true });

export const RepoMeta = mongoose.model('RepoMeta', repoMetaSchema);
