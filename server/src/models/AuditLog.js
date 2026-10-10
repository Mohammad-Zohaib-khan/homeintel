import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  action: { type: String, required: true, index: true, maxlength: 64 },
  outcome: { type: String, enum: ['success', 'failure'], default: 'success' },
  ipPrefix: { type: String, maxlength: 64 },   // truncated, not the full address
  userAgent: { type: String, maxlength: 200 },
  meta: { type: mongoose.Schema.Types.Mixed },  // callers pass only non-sensitive scalars
}, { timestamps: { createdAt: true, updatedAt: false } });

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', schema);
