import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as OTPAuth from 'otpauth';
import { connectTestDb, disconnectTestDb, Client } from './helpers.js';

const dbUp = await connectTestDb();
const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { RefreshSession } = await import('../src/models/RefreshSession.js');
const { AuditLog } = await import('../src/models/AuditLog.js');
const { RecoveryCode } = await import('../src/models/RecoveryCode.js');

let server, base;
const PW = 'Correct-Horse-9-Battery';
let n = 0;
const creds = () => ({ email: `user${++n}-${Date.now()}@example.com`, name: 'Test User', password: PW });
const newClient = () => new Client(base);
const code = (secret, offsetSteps = 0) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: Date.now() + offsetSteps * 30_000 });

// Advance the server's clock (same process) so successive TOTP steps can be used in one test run.
const realNow = Date.now; let skew = 0;
Date.now = () => realNow() + skew;
const advance = (steps) => { skew += steps * 30_000; };

describe('auth API', { skip: !dbUp && 'MongoDB unavailable' }, () => {
  before(async () => { await Promise.all([User.init(), RefreshSession.init()]); server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`; });
  after(async () => { server?.close(); await disconnectTestDb(); Date.now = realNow; });

  it('registers, sets HttpOnly cookies, returns no tokens or secrets in the body', async () => {
    const c = newClient(); const u = creds();
    const r = await c.post('/api/auth/register', u);
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body.data.user).sort(), ['createdAt', 'email', 'id', 'mfaEnabled', 'name', 'role']);
    assert.ok(!JSON.stringify(r.body).match(/token|hash|argon/i));
    const flags = c.lastCookies.map((s) => s.toLowerCase());
    assert.ok(flags.length >= 2);
    for (const f of flags) { assert.match(f, /httponly/); assert.match(f, /samesite=lax/); }
    assert.ok(flags.find((f) => f.startsWith('hi_rt=')).includes('path=/api/auth'));
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200); assert.equal(me.body.data.user.email, u.email);
  });

  it('stores the password as Argon2id and never as plaintext', async () => {
    const c = newClient(); const u = creds(); await c.post('/api/auth/register', u);
    const doc = await User.findOne({ email: u.email }).select('+passwordHash');
    assert.match(doc.passwordHash, /^\$argon2id\$/); assert.ok(!doc.passwordHash.includes(PW));
  });

  it('rejects state-changing requests without a valid CSRF token', async () => {
    const c = newClient(); const u = creds();
    assert.equal((await c.post('/api/auth/register', u, { csrf: false })).status, 403);
    await c.ensureCsrf();
    const bad = await c.post('/api/auth/register', u, { csrf: false, headers: { 'x-csrf-token': 'x'.repeat(40) } });
    assert.equal(bad.status, 403); assert.equal(bad.body.error.code, 'CSRF_INVALID');
  });

  it('validates input server-side: weak password, bad email, mass-assignment of role', async () => {
    const c = newClient(); const u = creds();
    assert.equal((await c.post('/api/auth/register', { ...u, password: 'short' })).status, 400);
    assert.equal((await c.post('/api/auth/register', { ...u, email: 'nope' })).status, 400);
    const r = await c.post('/api/auth/register', { ...u, role: 'admin' });
    assert.equal(r.status, 400); assert.equal(r.body.error.code, 'VALIDATION_ERROR');
    assert.equal(await User.countDocuments({ email: u.email }), 0);
  });

  it('rejects duplicate emails', async () => {
    const u = creds(); await newClient().post('/api/auth/register', u);
    assert.equal((await newClient().post('/api/auth/register', u)).status, 409);
  });

  it('blocks NoSQL operator injection on login', async () => {
    const c = newClient();
    const r = await c.post('/api/auth/login', { email: { $ne: null }, password: { $ne: null } });
    assert.equal(r.status, 400);
  });

  it('login failure messages do not reveal whether the account exists', async () => {
    const u = creds(); await newClient().post('/api/auth/register', u);
    const a = await newClient().post('/api/auth/login', { email: u.email, password: 'Wrong-Password-123' });
    const b = await newClient().post('/api/auth/login', { email: 'ghost@example.com', password: 'Wrong-Password-123' });
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.deepEqual(a.body, b.body);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const u = creds(); await newClient().post('/api/auth/register', u);
    for (let i = 0; i < 5; i++) await newClient().post('/api/auth/login', { email: u.email, password: 'Wrong-Password-123' });
    const r = await newClient().post('/api/auth/login', { email: u.email, password: PW });
    assert.equal(r.status, 429); assert.equal(r.body.error.code, 'ACCOUNT_LOCKED');
  });

  it('protects /me: no cookie, tampered cookie, and logout all yield 401', async () => {
    assert.equal((await newClient().get('/api/auth/me')).status, 401);
    const c = newClient(); await c.post('/api/auth/register', creds());
    const key = [...c.jar.keys()].find((k) => k.startsWith('hi_at|'));
    c.jar.get(key).value += 'x';
    assert.equal((await c.get('/api/auth/me')).status, 401);
    const d = newClient(); await d.post('/api/auth/register', creds());
    assert.equal((await d.post('/api/auth/logout', {})).status, 200);
    assert.equal((await d.get('/api/auth/me')).status, 401);
  });

  it('rotates refresh tokens and revokes the whole family when an old one is reused', async () => {
    const c = newClient(); await c.post('/api/auth/register', creds());
    const old = c.cookie('hi_rt');
    assert.equal((await c.post('/api/auth/refresh', {})).status, 200);
    const fresh = c.cookie('hi_rt'); assert.notEqual(old, fresh);
    // attacker replays the stolen (already-rotated) token
    const thief = newClient(); thief.jar.set('hi_rt|/api/auth', { name: 'hi_rt', value: old, path: '/api/auth' });
    assert.equal((await thief.post('/api/auth/refresh', {})).status, 401);
    // legitimate holder is now logged out too
    assert.equal((await c.post('/api/auth/refresh', {})).status, 401);
    assert.ok(await AuditLog.findOne({ action: 'auth.refresh_reuse_detected' }));
  });

  it('stores refresh tokens only as hashes', async () => {
    const c = newClient(); await c.post('/api/auth/register', creds());
    assert.equal(await RefreshSession.countDocuments({ tokenHash: c.cookie('hi_rt') }), 0);
  });

  it('changes password: needs current password, revokes other sessions', async () => {
    const u = creds(); const a = newClient(); await a.post('/api/auth/register', u);
    const b = newClient(); await b.post('/api/auth/login', { email: u.email, password: PW });
    const bad = await a.post('/api/auth/change-password', { currentPassword: 'nope-nope-nope', newPassword: 'Another-Strong-Pass-1' });
    assert.equal(bad.status, 401);
    const ok = await a.post('/api/auth/change-password', { currentPassword: PW, newPassword: 'Another-Strong-Pass-1' });
    assert.equal(ok.status, 200);
    assert.equal((await a.get('/api/auth/me')).status, 200);   // initiating session continues
    assert.equal((await b.get('/api/auth/me')).status, 401);   // other session revoked
    assert.equal((await newClient().post('/api/auth/login', { email: u.email, password: PW })).status, 401);
  });

  describe('MFA (TOTP)', () => {
    it('full lifecycle: setup → enable → challenge → replay blocked → recovery code single-use → disable', async () => {
      const u = creds(); const c = newClient(); await c.post('/api/auth/register', u);
      const setup = await c.post('/api/auth/mfa/setup', {});
      assert.equal(setup.status, 200); assert.match(setup.body.data.qrDataUrl, /^data:image\/png/);
      const secret = setup.body.data.secret;
      const stored = await User.findOne({ email: u.email }).select('+mfa.pendingSecretEnc');
      assert.ok(!stored.mfa.pendingSecretEnc.includes(secret), 'secret must be encrypted at rest');

      assert.equal((await c.post('/api/auth/mfa/enable', { code: '000000' })).status, 400);
      advance(0);
      const en = await c.post('/api/auth/mfa/enable', { code: code(secret) });
      assert.equal(en.status, 200); assert.equal(en.body.data.recoveryCodes.length, 10);
      const recovery = en.body.data.recoveryCodes;
      const stored2 = JSON.stringify(await RecoveryCode.find({}).lean());
      assert.ok(!stored2.includes(recovery[0]) && !stored2.includes(recovery[0].replace('-', '')), 'recovery codes stored hashed');

      // password alone no longer grants a session
      const d = newClient();
      const step1 = await d.post('/api/auth/login', { email: u.email, password: PW });
      assert.equal(step1.body.data.mfaRequired, true);
      assert.equal((await d.get('/api/auth/me')).status, 401);
      assert.equal((await d.post('/api/auth/mfa/login', { code: '123456' })).status, 401);

      advance(2); // move past the step consumed by enable()
      const good = code(secret);
      assert.equal((await d.post('/api/auth/mfa/login', { code: good })).status, 200);
      assert.equal((await d.get('/api/auth/me')).status, 200);

      // replay of the same code on a fresh sign-in is rejected
      const e = newClient(); await e.post('/api/auth/login', { email: u.email, password: PW });
      assert.equal((await e.post('/api/auth/mfa/login', { code: good })).status, 401);

      // recovery code works once
      const f = newClient(); await f.post('/api/auth/login', { email: u.email, password: PW });
      assert.equal((await f.post('/api/auth/mfa/login', { recoveryCode: recovery[0] })).status, 200);
      const g = newClient(); await g.post('/api/auth/login', { email: u.email, password: PW });
      assert.equal((await g.post('/api/auth/mfa/login', { recoveryCode: recovery[0] })).status, 401);

      // disabling needs password + second factor
      assert.equal((await d.post('/api/auth/mfa/disable', { password: PW })).status, 401);
      advance(2);
      assert.equal((await d.post('/api/auth/mfa/disable', { password: PW, code: code(secret) })).status, 200);
      assert.equal((await newClient().post('/api/auth/login', { email: u.email, password: PW })).body.data.mfaRequired, false);
    });
  });

  it('a two-factor secret encrypted with a different key yields a clear 503, not a crash', async () => {
    const u = creds(); const c = newClient(); await c.post('/api/auth/register', u);
    const s = await c.post('/api/auth/mfa/setup', {}); advance(2);
    await c.post('/api/auth/mfa/enable', { code: code(s.body.data.secret) });
    await User.updateOne({ email: u.email }, { $set: { 'mfa.secretEnc': 'v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAA' } });
    const d = newClient(); await d.post('/api/auth/login', { email: u.email, password: PW }); advance(2);
    const r = await d.post('/api/auth/mfa/login', { code: code(s.body.data.secret) });
    assert.equal(r.status, 503); assert.equal(r.body.error.code, 'MFA_KEY_MISMATCH');
  });

  it('writes audit entries without sensitive data', async () => {
    const u = creds(); await newClient().post('/api/auth/register', u);
    const logs = await AuditLog.find({ action: 'auth.register' }).sort({ createdAt: -1 }).limit(1).lean();
    assert.ok(logs[0].ipPrefix.endsWith('.0/24'));
    assert.ok(!JSON.stringify(logs[0]).includes(PW));
  });
});
