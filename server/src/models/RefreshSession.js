import mongoose from 'mongoose';
import { ttlIndex } from './ttl.js';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  familyId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  userAgent: { type: String, maxlength: 200 },
  // How the session family was authenticated: 'pwd' (password only) or 'mfa' (second factor verified).
  amr: { type: String, enum: ['pwd', 'mfa'], default: 'pwd' },
}, { timestamps: true });
ttlIndex(schema, 'expiresAt');

export const RefreshSession = mongoose.models.RefreshSession || mongoose.model('RefreshSession', schema);
