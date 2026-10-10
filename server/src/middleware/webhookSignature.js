import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { WebhookReceipt } from '../models/WebhookReceipt.js';
import { sha256 } from '../utils/crypto.js';

/*
 * Verifies `X-HomeIntel-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`.
 * Rejects: missing secret config, malformed header, timestamps outside ±5 minutes, bad MACs (constant-time compare),
 * and replays of an already-accepted signature. Supports a previous secret during rotation.
 */
export const TOLERANCE_S = 300;
export function sign(secret, body, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}
const eq = (a, b) => { const x = Buffer.from(a, 'hex'); const y = Buffer.from(b, 'hex'); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };

export async function verifyWebhook(req, _res, next) {
  try {
    const secrets = [env.WEBHOOK_SIGNING_SECRET, env.WEBHOOK_SIGNING_SECRET_PREVIOUS].filter(Boolean);
    if (!secrets.length) throw new AppError(503, 'WEBHOOKS_DISABLED', 'Webhooks are not configured on this server');
    const header = req.get('x-homeintel-signature') || '';
    const m = /^t=(\d{9,11}),v1=([a-f0-9]{64})$/.exec(header);
    if (!m || !req.rawBody) throw new AppError(401, 'BAD_SIGNATURE', 'Missing or malformed signature');
    const t = Number(m[1]);
    if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) throw new AppError(401, 'STALE_SIGNATURE', 'Signature timestamp outside the allowed window');
    const payload = `${t}.${req.rawBody}`;
    const valid = secrets.some((s) => eq(crypto.createHmac('sha256', s).update(payload).digest('hex'), m[2]));
    if (!valid) throw new AppError(401, 'BAD_SIGNATURE', 'Signature does not match');
    try { await WebhookReceipt.create({ sigHash: sha256(m[2]), expiresAt: new Date((t + TOLERANCE_S * 2) * 1000) }); }
    catch (e) { if (e?.code === 11000) throw new AppError(409, 'REPLAYED', 'This webhook delivery was already processed'); throw e; }
    next();
  } catch (e) { next(e); }
}
