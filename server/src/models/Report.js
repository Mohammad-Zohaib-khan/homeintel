import mongoose from 'mongoose';

// Reports are immutable snapshots: content is computed at creation and never recomputed silently.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 140 },
  kind: { type: String, enum: ['profile', 'comparison'], required: true },
  neighborhoodIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Neighborhood' }], validate: (v) => v.length >= 1 && v.length <= 4 },
  weights: { type: mongoose.Schema.Types.Mixed, required: true },
  content: { type: String, required: true },          // JSON string of the structured, plain-text report body
  scoringVersion: { type: String, required: true },
  containsDemoData: { type: Boolean, default: false },
  ai: {
    status: { type: String, enum: ['not_requested', 'included', 'unavailable', 'failed', 'pending'], default: 'not_requested' },
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIRun', default: null },
  },
  share: {
    enabled: { type: Boolean, default: false },
    token: { type: String, index: { unique: true, sparse: true } },  // capability token; absent (not null) when not shared so the sparse unique index ignores it
    sharedAt: { type: Date, default: null },
  },
}, { timestamps: true });

export const Report = mongoose.models.Report || mongoose.model('Report', schema);
