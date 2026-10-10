import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hash: { type: String, required: true },   // SHA-256 of the normalised code; plaintext is shown once and never stored
  usedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ userId: 1, hash: 1 }, { unique: true });

export const RecoveryCode = mongoose.models.RecoveryCode || mongoose.model('RecoveryCode', schema);
