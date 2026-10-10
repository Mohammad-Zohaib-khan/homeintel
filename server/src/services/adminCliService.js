// Operations behind `npm run admin -- <command>`. Kept separate from the CLI so they are unit-testable.
import { User } from '../models/User.js';
import { hashPassword, passwordSchema } from './passwordService.js';
import { provisionForOperator } from './mfaService.js';
import { revokeAllForUser } from './tokenService.js';
import { AuditLog } from '../models/AuditLog.js';

const fail = (msg) => { const e = new Error(msg); e.cli = true; throw e; };
const log = (action, userId, meta) => AuditLog.create({ action, userId, outcome: 'success', ipPrefix: 'cli', userAgent: 'homeintel-admin-cli', meta });

export async function createAdmin({ email, name, password }) {
  email = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Provide a valid --email.');
  if (!name?.trim()) fail('Provide --name.');
  const pw = passwordSchema.safeParse(password ?? '');
  if (!pw.success) fail(`Password rejected: ${pw.error.issues[0].message}.`);
  if (await User.exists({ email })) fail('An account with this email already exists. Use `promote` instead (the account needs two-factor sign-in first).');
  const user = await User.create({ email, name: name.trim().slice(0, 80), passwordHash: await hashPassword(password), role: 'admin' });
  const mfa = await provisionForOperator(user._id, email);
  await log('admin.cli_create', user._id, { email });
  return { user, ...mfa };
}

export async function promote(email) {
  const u = await User.findOne({ email: String(email ?? '').trim().toLowerCase() });
  if (!u) fail('No account with that email.');
  if (u.role === 'admin') return { user: u, changed: false };
  if (!u.mfa?.enabled) fail('That account has no two-factor sign-in. Ask them to turn it on in Account, then run promote again.');
  await User.updateOne({ _id: u._id }, { $set: { role: 'admin' }, $inc: { tokenVersion: 1 } });
  await revokeAllForUser(u._id);
  await log('admin.cli_promote', u._id, { email: u.email });
  return { user: await User.findById(u._id), changed: true };
}

export async function demote(email) {
  const u = await User.findOne({ email: String(email ?? '').trim().toLowerCase() });
  if (!u) fail('No account with that email.');
  if (u.role !== 'admin') return { user: u, changed: false };
  if (await User.countDocuments({ role: 'admin' }) <= 1) fail('This is the only admin. Promote someone else first.');
  await User.updateOne({ _id: u._id }, { $set: { role: 'user' }, $inc: { tokenVersion: 1 } });
  await revokeAllForUser(u._id);
  await log('admin.cli_demote', u._id, { email: u.email });
  return { user: await User.findById(u._id), changed: true };
}

export const listAdmins = () => User.find({ role: 'admin' }, { email: 1, name: 1, createdAt: 1, lastLoginAt: 1, 'mfa.enabled': 1 }).sort({ createdAt: 1 }).lean();
