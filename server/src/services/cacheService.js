import { ProviderCache } from '../models/ProviderCache.js';
import { sha256 } from '../utils/crypto.js';

// Read-through cache for provider responses. Keys must never include secrets (callers pass a key-free descriptor).
export async function cached(provider, descriptor, ttlMs, fetcher) {
  const key = sha256(`${provider}|${descriptor}`);
  const hit = await ProviderCache.findOne({ key }).lean();
  if (hit && new Date(hit.expiresAt) > new Date()) return { body: JSON.parse(hit.body), cached: true, fetchedAt: hit.fetchedAt };
  const body = await fetcher();
  const fetchedAt = new Date();
  await ProviderCache.updateOne({ key }, { $set: { provider, body: JSON.stringify(body), fetchedAt, expiresAt: new Date(Date.now() + ttlMs) } }, { upsert: true });
  return { body, cached: false, fetchedAt };
}
