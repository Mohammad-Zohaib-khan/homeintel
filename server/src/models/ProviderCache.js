import mongoose from 'mongoose';
import { ttlIndex } from './ttl.js';

// Response cache for outbound provider calls (keeps us polite with public APIs).
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },               // sha256 of method+url+body (never contains API keys)
  provider: { type: String, required: true },
  body: { type: String, required: true },                            // JSON string (provider keys may contain '.' or '$')
  fetchedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});
ttlIndex(schema, 'expiresAt');

export const ProviderCache = mongoose.models.ProviderCache || mongoose.model('ProviderCache', schema);
