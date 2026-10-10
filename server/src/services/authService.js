import { User } from '../models/User.js';
import { hashPassword, verifyPassword, dummyVerify } from './passwordService.js';
import { signAccess, issueRefresh, rotateRefresh, revokeRefresh, revokeAllForUser, signMfaChallenge, verifyMfaChallenge } from './tokenService.js';
import * as mfa from './mfaService.js';
import { audit } from './auditService.js';
import { AppError } from '../utils/AppError.js';

const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;
const BAD_CREDS = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const LOCKED = () => new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes.');

export async function startSession(user, req, { familyId, amr = 'pwd' } = {}) {
  const [access, refresh] = await Promise.all([signAccess(user, amr), issueRefresh(user._id, { userAgent: req.get('user-agent'), familyId, amr })]);
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return { access, refresh: refresh.token };
}

async function recordFailure(userId) {
  await User.updateOne({ _id: userId }, { $inc: { failedLogins: 1 } });  // atomic increment
  const u = await User.findById(userId);
  if (u && u.failedLogins >= MAX_FAILS) await User.updateOne({ _id: userId }, { $set: { lockUntil: new Date(Date.now() + LOCK_MS), failedLogins: 0 } });
}
const clearFailures = (userId) => User.updateOne({ _id: userId }, { $set: { failedLogins: 0, lockUntil: null } });
const isLocked = (u) => u.lockUntil && u.lockUntil > new Date();

export async function register(req, { email, name, password }) {
  const passwordHash = await hashPassword(password);
  let user;
  try { user = await User.create({ email, name, passwordHash }); }
  catch (e) { if (e?.code === 11000) throw AppError.conflict('An account with this email already exists'); throw e; }
  await audit(req, 'auth.register', { userId: user._id });
  return { user, tokens: await startSession(user, req) };
}

export async function login(req, { email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) { await dummyVerify(password); await audit(req, 'auth.login', { outcome: 'failure', meta: { reason: 'unknown_account' } }); throw BAD_CREDS(); }
  if (isLocked(user)) { await audit(req, 'auth.login', { userId: user._id, outcome: 'failure', meta: { reason: 'locked' } }); throw LOCKED(); }
  if (!(await verifyPassword(user.passwordHash, password))) {
    await recordFailure(user._id);
    await audit(req, 'auth.login', { userId: user._id, outcome: 'failure', meta: { reason: 'bad_password' } });
    throw BAD_CREDS();
  }
  if (user.mfa.enabled) return { mfaRequired: true, challenge: await signMfaChallenge(user) };
  await clearFailures(user._id);
  await audit(req, 'auth.login', { userId: user._id });
  return { user, tokens: await startSession(user, req) };
}

export async function completeMfaLogin(req, challengeToken, factor) {
  let sub;
  try { sub = (await verifyMfaChallenge(challengeToken)).sub; } catch { throw new AppError(401, 'MFA_CHALLENGE_EXPIRED', 'Your sign-in expired. Please enter your password again.'); }
  const user = await User.findById(sub);
  if (!user) throw BAD_CREDS();
  if (isLocked(user)) throw LOCKED();
  if (!(await mfa.verifySecondFactor(user._id, factor))) {
    await recordFailure(user._id);
    await audit(req, 'auth.mfa_login', { userId: user._id, outcome: 'failure' });
    throw new AppError(401, 'MFA_INVALID', 'That code is not valid or was already used');
  }
  await clearFailures(user._id);
  await audit(req, 'auth.mfa_login', { userId: user._id, meta: { method: factor.recoveryCode ? 'recovery' : 'totp' } });
  return { user, tokens: await startSession(user, req, { amr: 'mfa' }) };
}

export async function refresh(req, token) {
  if (!token) throw AppError.unauthorized();
  const r = await rotateRefresh(token, req.get('user-agent'));
  if (!r) throw AppError.unauthorized('Session expired');
  if (r.reuse) { await audit(req, 'auth.refresh_reuse_detected', { userId: r.userId, outcome: 'failure' }); throw AppError.unauthorized('Session expired'); }
  const user = await User.findById(r.userId);
  if (!user) throw AppError.unauthorized();
  // A password-only session stays password-only on refresh, even if MFA was enabled since.
  return { user, tokens: { access: await signAccess(user, r.amr), refresh: r.token } };
}

export async function logout(req, token) {
  if (token) await revokeRefresh(token);
  if (req.user) await audit(req, 'auth.logout', { userId: req.user._id });
}

// Sensitive: requires current password (+ second factor when enabled). Invalidates every other session.
export async function changePassword(req, user, { currentPassword, newPassword, code, recoveryCode }) {
  const full = await User.findById(user._id).select('+passwordHash');
  if (!(await verifyPassword(full.passwordHash, currentPassword))) { await audit(req, 'auth.password_change', { userId: user._id, outcome: 'failure' }); throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect'); }
  if (full.mfa.enabled && !(await mfa.verifySecondFactor(user._id, { code, recoveryCode }))) throw new AppError(401, 'MFA_INVALID', 'A valid authenticator or recovery code is required');
  const passwordHash = await hashPassword(newPassword);
  await User.updateOne({ _id: user._id }, { $set: { passwordHash }, $inc: { tokenVersion: 1 } });
  const updated = await User.findById(user._id);
  await revokeAllForUser(user._id);
  await audit(req, 'auth.password_change', { userId: user._id });
  return { user: updated, tokens: await startSession(updated, req, { amr: req.auth?.amr === 'mfa' ? 'mfa' : 'pwd' }) };
}

export async function disableMfa(req, user, { password, code, recoveryCode }) {
  const full = await User.findById(user._id).select('+passwordHash');
  if (!full.mfa.enabled) throw AppError.badRequest('MFA is not enabled');
  if (full.role === 'admin') throw new AppError(403, 'ADMIN_MFA_LOCKED', 'Admins must keep two-factor sign-in on. Ask another admin to remove your admin role first.');
  if (!(await verifyPassword(full.passwordHash, password))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
  if (!(await mfa.verifySecondFactor(user._id, { code, recoveryCode }))) throw new AppError(401, 'MFA_INVALID', 'A valid authenticator or recovery code is required');
  await mfa.disable(user._id);
  await audit(req, 'auth.mfa_disabled', { userId: user._id });
}

// Permanently deletes the account and everything it owns. Requires password (+ second factor when enabled).
export async function deleteAccount(req, user, { password, code, recoveryCode }) {
  const full = await User.findById(user._id).select('+passwordHash');
  if (!(await verifyPassword(full.passwordHash, password))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
  if (full.mfa.enabled && !(await mfa.verifySecondFactor(user._id, { code, recoveryCode }))) throw new AppError(401, 'MFA_INVALID', 'A valid authenticator or recovery code is required');
  const { purgeUserData } = await import('./accountService.js');
  await purgeUserData(user._id);
  await audit(req, 'auth.account_deleted', { userId: null, meta: { at: new Date().toISOString() } });
}

// "Sign out everywhere": revokes every refresh session and invalidates outstanding access tokens.
export async function logoutAll(req) {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  await revokeAllForUser(req.user._id);
  await audit(req, 'auth.logout_all', { userId: req.user._id });
}
