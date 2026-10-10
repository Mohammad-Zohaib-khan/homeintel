import crypto from 'node:crypto';
import { env } from '../config/env.js';

const KEY = Buffer.from(env.MFA_ENCRYPTION_KEY, 'hex');
const PREV = env.MFA_ENCRYPTION_KEY_PREVIOUS ? Buffer.from(env.MFA_ENCRYPTION_KEY_PREVIOUS, 'hex') : null;

export const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// AES-256-GCM authenticated encryption for secrets at rest (TOTP seeds).
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
function decryptWith(key, iv, tag, ct) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
// Tries the current key, then the previous one (key rotation). Re-encrypt with the current key on next write.
export function decrypt(blob) {
  const [v, iv, tag, ct] = String(blob).split('.');
  if (v !== 'v1') throw new Error('Unsupported ciphertext version');
  try { return decryptWith(KEY, iv, tag, ct); } catch (e) { if (!PREV) throw e; return decryptWith(PREV, iv, tag, ct); }
}
