import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agent: { type: String, enum: ['research', 'comparison', 'report'], required: true },
  provider: { type: String, required: true, maxlength: 40 },
  model: { type: String, maxlength: 100 },
  input: {
    neighborhoodIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Neighborhood' }],
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
    question: { type: String, maxlength: 300 },
    evidenceCount: Number,
  },
  status: { type: String, enum: ['running', 'succeeded', 'failed', 'rejected'], required: true },
  output: { type: String },                                   // validated JSON string (plain text fields only)
  citations: { checked: Number, dropped: Number },
  error: { type: String, maxlength: 300 },
  latencyMs: Number,
  usage: { inputTokens: Number, outputTokens: Number },
}, { timestamps: true });
schema.index({ userId: 1, createdAt: -1 });

export const AIRun = mongoose.models.AIRun || mongoose.model('AIRun', schema);
