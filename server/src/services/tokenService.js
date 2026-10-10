import mongoose from 'mongoose';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { randomToken, sha256 } from '../utils/crypto.js';

const ISS = 'homeintel', AUD = 'homeintel-api';
const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const previousKey = env.JWT_ACCESS_SECRET_PREVIOUS ? new TextEncoder().encode(env.JWT_ACCESS_SECRET_PREVIOUS) : null;
// Verification accepts the previous secret during rotation; signing always uses the current one.
async function verifyAny(token) {
  try { return await jwtVerify(token, accessKey, { issuer: ISS, audience: AUD, algorithms: ['HS256'] }); }
  catch (e) { if (!previousKey) throw e; return jwtVerify(token, previousKey, { issuer: ISS, audience: AUD, algorithms: ['HS256'] }); }
}
const refreshWindowMs = 7 * 24 * 3600 * 1000;
export const ACCESS_TTL_S = 15 * 60;

// `amr` records the authentication strength of the session ('pwd' | 'mfa'); sensitive areas (admin) require 'mfa'.
export const signAccess = (user, amr = 'pwd') =>
  new SignJWT({ ver: user.tokenVersion, typ: 'access', amr }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user._id)).setIssuer(ISS).setAudience(AUD).setIssuedAt().setExpirationTime(`${ACCESS_TTL_S}s`).sign(accessKey);

export async function verifyAccess(token) {
  const { payload } = await verifyAny(token);
  if (payload.typ !== 'access') throw new Error('wrong token type');
  return payload;
}

// Short-lived, single-purpose token proving the password step passed; carried in an HttpOnly cookie.
export const signMfaChallenge = (user) =>
  new SignJWT({ typ: 'mfa' }).setProtectedHeader({ alg: 'HS256' }).setSubject(String(user._id))
    .setIssuer(ISS).setAudience(AUD).setIssuedAt().setExpirationTime('5m').sign(accessKey);
export async function verifyMfaChallenge(token) {
  const { payload } = await verifyAny(token);
  if (payload.typ !== 'mfa') throw new Error('wrong token type');
  return payload;
}

// Opaque refresh tokens: only a SHA-256 hash is stored. Rotated on every use, family revoked on reuse.
export async function issueRefresh(userId, { familyId = randomToken(16), userAgent, amr = 'pwd' } = {}) {
  const token = randomToken(48);
  await RefreshSession.create({ userId, familyId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + refreshWindowMs), userAgent: userAgent?.slice(0, 200), amr });
  return { token, familyId };
}

export async function rotateRefresh(token, userAgent) {
  const hash = sha256(token);
  const now = new Date();
  // Atomic claim: only one concurrent caller can revoke a live token.
  const claimed = await RefreshSession.findOneAndUpdate({ tokenHash: hash, revokedAt: null, expiresAt: mongoose.trusted({ $gt: now }) }, { $set: { revokedAt: now } }, { new: true });
  if (claimed) {
    const amr = claimed.amr === 'mfa' ? 'mfa' : 'pwd';
    const next = await issueRefresh(claimed.userId, { familyId: claimed.familyId, userAgent, amr });
    return { userId: claimed.userId, token: next.token, reuse: false, amr };
  }
  const existing = await RefreshSession.findOne({ tokenHash: hash });
  if (existing && existing.revokedAt) {
    // A revoked token was presented again: assume theft, kill the whole family.
    await RefreshSession.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: now } });
    return { reuse: true, userId: existing.userId };
  }
  return null;
}

export const revokeRefresh = (token) => RefreshSession.updateOne({ tokenHash: sha256(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
export const revokeAllForUser = (userId) => RefreshSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
