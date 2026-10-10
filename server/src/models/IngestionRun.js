import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  neighborhoodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Neighborhood', index: true },
  provider: { type: String, required: true, maxlength: 40 },
  trigger: { type: String, enum: ['cli', 'on_demand', 'webhook', 'refresh', 'admin'], required: true },
  status: { type: String, enum: ['running', 'success', 'skipped', 'failed'], required: true },
  counts: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, maxlength: 500 },                           // sanitized message, never secrets
  startedAt: { type: Date, required: true },
  finishedAt: Date,
}, { timestamps: false });

export const IngestionRun = mongoose.models.IngestionRun || mongoose.model('IngestionRun', schema);
