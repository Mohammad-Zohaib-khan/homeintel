import mongoose from 'mongoose';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { RecoveryCode } from '../models/RecoveryCode.js';
import { encrypt, decrypt, sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';

const PERIOD = 30;
const totp = (secretBase32, label) => new OTPAuth.TOTP({ issuer: 'HomeIntel', label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: OTPAuth.Secret.fromBase32(secretBase32) });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRecoveryCode() {
  const b = crypto.randomBytes(10);
  const c = Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
  return `${c.slice(0, 5)}-${c.slice(5)}`;
}
const normRecovery = (c) => c.trim().toUpperCase().replace(/\s/g, '');

export async function beginSetup(userId) {
  const user = await User.findById(userId);
  if (!user) throw AppError.unauthorized();
  if (user.mfa.enabled) throw AppError.conflict('Multi-factor authentication is already enabled');
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  await User.updateOne({ _id: userId }, { $set: { 'mfa.pendingSecretEnc': encrypt(secret) } });
  const uri = totp(secret, user.email).toString();
  return { secret, otpauthUri: uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

// Verifies a TOTP code and enforces single use per 30-second step (replay protection).
// A secret that no longer decrypts means the server's MFA_ENCRYPTION_KEY changed (misconfiguration), not a wrong code.
function openSecret(secretEnc) {
  try { return decrypt(secretEnc); }
  catch {
    logger.error('Two-factor secret could not be decrypted: MFA_ENCRYPTION_KEY differs from the key it was encrypted with');
    throw new AppError(503, 'MFA_KEY_MISMATCH', 'Two-factor codes can’t be checked right now because the server’s encryption key changed. Use a recovery code, or contact the administrator.');
  }
}

async function checkTotp(userId, secretEnc, code, email) {
  const delta = totp(openSecret(secretEnc), email).validate({ token: code, window: 1 });
  if (delta === null) return false;
  const step = Math.floor(Date.now() / 1000 / PERIOD) + delta;
  const res = await User.updateOne({ _id: userId, 'mfa.lastStep': mongoose.trusted({ $lt: step }) }, { $set: { 'mfa.lastStep': step } });
  return res.modifiedCount === 1;
}

export async function enable(userId, code) {
  const user = await User.findById(userId).select('+mfa.pendingSecretEnc +mfa.secretEnc');
  if (!user?.mfa.pendingSecretEnc) throw AppError.badRequest('Start MFA setup first');
  const delta = totp(openSecret(user.mfa.pendingSecretEnc), user.email).validate({ token: code, window: 1 });
  if (delta === null) throw AppError.badRequest('That code is not valid. Check your authenticator app and try again.');
  const codes = Array.from({ length: 10 }, newRecoveryCode);
  await User.updateOne({ _id: userId }, {
    $set: { 'mfa.enabled': true, 'mfa.secretEnc': user.mfa.pendingSecretEnc, 'mfa.lastStep': Math.floor(Date.now() / 1000 / PERIOD) + delta },
    $unset: { 'mfa.pendingSecretEnc': '' },
  });
  await RecoveryCode.deleteMany({ userId });
  await RecoveryCode.insertMany(codes.map((c) => ({ userId, hash: sha256(normRecovery(c)) })));
  return codes; // shown to the user exactly once
}

// Accepts either a TOTP code or an unused recovery code. Returns true on success.
export async function verifySecondFactor(userId, { code, recoveryCode }) {
  const user = await User.findById(userId).select('+mfa.secretEnc');
  if (!user?.mfa.enabled || !user.mfa.secretEnc) return false;
  if (code) return checkTotp(userId, user.mfa.secretEnc, code, user.email);
  if (recoveryCode) {
    const h = sha256(normRecovery(recoveryCode));
    const res = await RecoveryCode.updateOne({ userId, hash: h, usedAt: null }, { $set: { usedAt: new Date() } }); // atomic single-use claim
    return res.modifiedCount === 1;
  }
  return false;
}

export async function disable(userId) {
  await User.updateOne({ _id: userId }, { $set: { 'mfa.enabled': false, 'mfa.lastStep': 0 }, $unset: { 'mfa.secretEnc': '', 'mfa.pendingSecretEnc': '' } });
  await RecoveryCode.deleteMany({ userId });
}

export async function remainingRecoveryCodes(userId) {
  return RecoveryCode.countDocuments({ userId, usedAt: null });
}

/**
 * Operator-side enrolment used by the admin CLI: creates and enables a TOTP secret plus recovery codes in one step.
 * Possession is established out-of-band (the operator at the server terminal scans the QR code shown there).
 */
export async function provisionForOperator(userId, email) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const codes = Array.from({ length: 10 }, newRecoveryCode);
  await User.updateOne({ _id: userId }, { $set: { 'mfa.enabled': true, 'mfa.secretEnc': encrypt(secret), 'mfa.lastStep': 0 }, $unset: { 'mfa.pendingSecretEnc': '' } });
  await RecoveryCode.deleteMany({ userId });
  await RecoveryCode.insertMany(codes.map((c) => ({ userId, hash: sha256(normRecovery(c)) })));
  return { secret, otpauthUri: totp(secret, email).toString(), recoveryCodes: codes };
}
