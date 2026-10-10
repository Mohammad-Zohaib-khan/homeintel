import mongoose from 'mongoose';
import { ttlIndex } from './ttl.js';

// Replay protection: each accepted webhook signature is remembered until its timestamp falls outside the window.
const schema = new mongoose.Schema({ sigHash: { type: String, required: true, unique: true }, expiresAt: { type: Date, required: true } });
ttlIndex(schema, 'expiresAt');
export const WebhookReceipt = mongoose.models.WebhookReceipt || mongoose.model('WebhookReceipt', schema);
