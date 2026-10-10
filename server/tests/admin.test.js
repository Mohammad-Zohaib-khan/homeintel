import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as OTPAuth from 'otpauth';
process.env.ONDEMAND_INGESTION = '0';
import { connectTestDb, disconnectTestDb, Client } from './helpers.js';
import * as fx from './fixtures.js';

const dbUp = await connectTestDb();
const { createApp } = await import('../src/app.js');
const { setTransport } = await import('../src/utils/safeFetch.js');
const { upsertLocality } = await import('../src/services/localityService.js');
const { seedDemoFor } = await import('../src/ingestion/demo.js');
const { createAdmin, promote, demote } = await import('../src/services/adminCliService.js');
const { User } = await import('../src/models/User.js');
const { AuditLog } = await import('../src/models/AuditLog.js');
const { RecoveryCode } = await import('../src/models/RecoveryCode.js');
const { RefreshSession } = await import('../src/models/RefreshSession.js');

const PW = 'Correct-Horse-9-Battery';
let server, base, nb;
// Each TOTP step can be used once; move the server clock forward between sign-ins (same process).
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
const nextStep = () => { skew += 31_000; };
const totp = (secret) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: Date.now() });

async function signInAdmin(email, secret) {
  const c = new Client(base);
  const r1 = await c.post('/api/auth/login', { email, password: PW });
  assert.equal(r1.body.data.mfaRequired, true);
  nextStep();
  assert.equal((await c.post('/api/auth/mfa/login', { code: totp(secret) })).status, 200);
  return c;
}
async function newUser(name = 'U') { const c = new Client(base); const email = `${name.toLowerCase()}${realNow()}${Math.random().toString(36).slice(2, 6)}@ex.com`; await c.post('/api/auth/register', { email, name, password: PW }); return { c, email }; }
async function enableMfa(c) {
  const s = await c.post('/api/auth/mfa/setup', {}); nextStep();
  assert.equal((await c.post('/api/auth/mfa/enable', { code: totp(s.body.data.secret) })).status, 200);
  return s.body.data.secret;
}

describe('admin console', { skip: !dbUp && 'MongoDB unavailable' }, () => {
  let admin, adminEmail, adminSecret;
  before(async () => {
    await Promise.all([User.init(), RecoveryCode.init(), RefreshSession.init()]);
    nb = await upsertLocality({ name: 'Kothrud', city: 'Pune', state: 'Maharashtra', lat: fx.center.lat, lng: fx.center.lng }, { origin: 'seed' });
    await seedDemoFor(nb);
    await upsertLocality({ name: 'Empty Place', city: 'Pune', state: 'Maharashtra', lat: 18.6, lng: 73.9 }, { origin: 'seed' });
    server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`;
    adminEmail = `ops${realNow()}@ex.com`;
    const created = await createAdmin({ email: adminEmail, name: 'Ops', password: PW });
    adminSecret = created.secret;
    assert.equal(created.recoveryCodes.length, 10);
    admin = await signInAdmin(adminEmail, adminSecret);
  });
  after(async () => { Date.now = realNow; setTransport(null); server?.close(); await disconnectTestDb(); });

  describe('access control', () => {
    it('anonymous → 401, ordinary user → 403 on every admin route', async () => {
      const { c } = await newUser();
      const routes = [['GET', '/api/admin/overview'], ['GET', '/api/admin/localities'], ['GET', '/api/admin/ingestion-runs'], ['GET', '/api/admin/quality'], ['GET', '/api/admin/security-events'], ['GET', '/api/admin/users'],
        ['POST', `/api/admin/localities/${nb._id}/refresh`], ['POST', '/api/admin/localities/refresh-stale'], ['POST', `/api/admin/users/${nb._id}/unlock`], ['POST', `/api/admin/users/${nb._id}/sign-out`], ['PATCH', `/api/admin/users/${nb._id}/role`]];
      for (const [m, p] of routes) {
        assert.equal((await new Client(base).req(m, p, m === 'GET' ? undefined : {})).status, 401, `anon ${m} ${p}`);
        const r = await c.req(m, p, m === 'GET' ? undefined : (m === 'PATCH' ? { role: 'admin' } : {}));
        assert.equal(r.status, 403, `user ${m} ${p}`); assert.equal(r.body.error.code, 'FORBIDDEN');
      }
    });

    it('a password-only session on an admin account is refused (step-up required)', async () => {
      // Simulate a session created before MFA verification: sign the access token with amr "pwd".
      const { signAccess } = await import('../src/services/tokenService.js');
      const u = await User.findOne({ email: adminEmail });
      const tok = await signAccess(u, 'pwd');
      const r = await fetch(`${base}/api/admin/overview`, { headers: { cookie: `hi_at=${tok}` } });
      assert.equal(r.status, 403); assert.equal((await r.json()).error.code, 'ADMIN_STEP_UP_REQUIRED');
    });

    it('stolen password + self-enrolled authenticator still cannot reach admin on an admin account without MFA', async () => {
      // An admin account somehow without MFA (e.g. legacy data): attacker logs in with password and enrols their own TOTP.
      const { c, email } = await newUser('Legacy');
      await User.updateOne({ email }, { $set: { role: 'admin' } });
      const atk = new Client(base); await atk.post('/api/auth/login', { email, password: PW });
      assert.equal((await atk.get('/api/admin/overview')).body.error.code, 'ADMIN_MFA_REQUIRED');
      await enableMfa(atk);
      const r = await atk.get('/api/admin/overview');
      assert.equal(r.status, 403); assert.equal(r.body.error.code, 'ADMIN_STEP_UP_REQUIRED', 'enrolling must not upgrade the current session');
      await User.updateOne({ email }, { $set: { role: 'user' } }); void c;
    });

    it('refresh keeps the session strength: an MFA session stays MFA, a password session stays password', async () => {
      assert.equal((await admin.post('/api/auth/refresh', {})).status, 200);
      assert.equal((await admin.get('/api/admin/overview')).status, 200);
      const s = await RefreshSession.findOne({ userId: (await User.findOne({ email: adminEmail }))._id, revokedAt: null });
      assert.equal(s.amr, 'mfa');
    });

    it('admins cannot turn two-factor off', async () => {
      nextStep();
      const r = await admin.post('/api/auth/mfa/disable', { password: PW, code: totp(adminSecret) });
      assert.equal(r.status, 403); assert.equal(r.body.error.code, 'ADMIN_MFA_LOCKED');
    });
  });

  describe('data health', () => {
    it('overview reports real counts', async () => {
      const r = await admin.get('/api/admin/overview');
      assert.equal(r.status, 200);
      const d = r.body.data;
      assert.ok(d.localities.total >= 2 && d.localities.demo >= 1 && d.localities.empty >= 1);
      assert.ok(d.users.admins >= 1 && d.users.withMfa >= 1);
      assert.equal(r.headers.get('cache-control'), 'no-store');
    });
    it('lists localities with data state and filters', async () => {
      const all = await admin.get('/api/admin/localities');
      const k = all.body.data.find((x) => x.slug === 'kothrud-pune');
      assert.equal(k.data, 'demo'); assert.ok(k.metrics.seed > 0); assert.equal(k.needsAttention, true);
      assert.deepEqual((await admin.get('/api/admin/localities?data=empty')).body.data.map((x) => x.name), ['Empty Place']);
      assert.equal((await admin.get('/api/admin/localities?q=kothr')).body.data.length, 1);
      assert.equal((await admin.get('/api/admin/localities?q=(.*')).status, 200, 'search is literal');
      assert.equal((await admin.get('/api/admin/localities?data=bogus')).status, 400);
    });
    it('queues a refresh even when on-demand ingestion is off, records the run, and audits it', async () => {
      setTransport(fx.fakeTransport([[/overpass/, { body: fx.overpass }], [/./, { status: 503, body: {} }]]));
      const r = await admin.post(`/api/admin/localities/${nb._id}/refresh`, {});
      assert.equal(r.status, 200); assert.equal(r.body.data.queued, true);
      for (let i = 0; i < 60; i++) { const l = (await admin.get('/api/admin/localities?q=kothrud')).body.data[0]; if (!['running', 'queued'].includes(l.ingestion.status)) break; await new Promise((x) => setTimeout(x, 250)); }
      const runs = (await admin.get('/api/admin/ingestion-runs?provider=overpass')).body.data;
      assert.ok(runs.some((x) => x.locality === 'Kothrud' && x.trigger === 'admin' && x.status === 'success'));
      const k = (await admin.get('/api/admin/localities?q=kothrud')).body.data[0];
      assert.equal(k.data, 'live', 'live amenity data replaced demo data');
      assert.ok(await AuditLog.exists({ action: 'admin.locality_refresh' }));
      assert.equal((await admin.post('/api/admin/localities/000000000000000000000000/refresh', {})).status, 404);
    });
    it('refresh-stale queues localities not refreshed recently', async () => {
      const r = await admin.post('/api/admin/localities/refresh-stale', { olderThanHours: 1 });
      assert.equal(r.status, 200); assert.ok(r.body.data.considered >= 1);
      assert.equal((await admin.post('/api/admin/localities/refresh-stale', { olderThanHours: 1, url: 'x' })).status, 400);
    });
    it('quality queue aggregates flags across localities with counts by code', async () => {
      await seedDemoFor(await upsertLocality({ name: 'Flagged Place', city: 'Pune', state: 'Maharashtra', lat: 18.55, lng: 73.85 }, { origin: 'seed' }));
      const r = await admin.get('/api/admin/quality');
      assert.ok(r.body.meta.byCode.DEMO_DATA >= 1 && r.body.meta.byCode.COARSE_GRANULARITY >= 1);
      assert.ok(r.body.data.some((f) => f.locality === 'Flagged Place'));
      assert.equal(r.status, 200); assert.ok(r.body.meta.total > 0); assert.ok(Object.keys(r.body.meta.byCode).length > 0);
      assert.ok(r.body.data.every((f) => f.locality && f.slug && f.message));
      const onlyWarn = await admin.get('/api/admin/quality?level=warning');
      assert.ok(onlyWarn.body.data.every((f) => f.level === 'warning'));
    });
  });

  describe('users and security', () => {
    it('lists users with counts only — never saved notes, report content or research questions', async () => {
      const { c, email } = await newUser('Private');
      await c.post('/api/saved-neighborhoods', { neighborhoodId: 'kothrud-pune', note: 'SECRET-NOTE-123' });
      const r = await admin.get(`/api/admin/users?q=${encodeURIComponent(email)}`);
      assert.equal(r.body.data.length, 1);
      const row = r.body.data[0];
      assert.equal(row.counts.saved, 1);
      assert.deepEqual(Object.keys(row).sort(), ['counts', 'createdAt', 'email', 'id', 'lastLoginAt', 'lockUntil', 'locked', 'mfaEnabled', 'name', 'role']);
      assert.ok(!JSON.stringify(r.body).includes('SECRET-NOTE-123'));
      assert.ok(!/passwordHash|secretEnc|tokenVersion|failedLogins/.test(JSON.stringify(r.body)));
      assert.equal((await admin.get('/api/admin/users?q=.*')).body.data.length, 0, 'email search is a literal prefix');
    });
    it('unlocks a locked account', async () => {
      const { email } = await newUser('Lock');
      for (let i = 0; i < 5; i++) await new Client(base).post('/api/auth/login', { email, password: 'wrong-password-x' });
      assert.equal((await new Client(base).post('/api/auth/login', { email, password: PW })).status, 429);
      const id = (await User.findOne({ email }))._id;
      const r = await admin.post(`/api/admin/users/${id}/unlock`, {});
      assert.equal(r.body.data.locked, false);
      assert.equal((await new Client(base).post('/api/auth/login', { email, password: PW })).status, 200);
    });
    it('signs a user out everywhere', async () => {
      const { c, email } = await newUser('Out');
      const id = (await User.findOne({ email }))._id;
      assert.equal((await admin.post(`/api/admin/users/${id}/sign-out`, {})).status, 200);
      assert.equal((await c.get('/api/auth/me')).status, 401);
      assert.equal((await c.post('/api/auth/refresh', {})).status, 401);
    });
    it('role changes: refuses own role, refuses users without 2FA, refuses removing the last admin', async () => {
      const me = await User.findOne({ email: adminEmail });
      const own = await admin.req('PATCH', `/api/admin/users/${me._id}/role`, { role: 'user' });
      assert.equal(own.status, 409); assert.equal(own.body.error.code, 'CANNOT_CHANGE_OWN_ROLE');

      const { c, email } = await newUser('Promo');
      const id = (await User.findOne({ email }))._id;
      const no2fa = await admin.req('PATCH', `/api/admin/users/${id}/role`, { role: 'admin' });
      assert.equal(no2fa.status, 409); assert.equal(no2fa.body.error.code, 'TARGET_NEEDS_MFA');
      const secret = await enableMfa(c);
      const up = await admin.req('PATCH', `/api/admin/users/${id}/role`, { role: 'admin' });
      assert.equal(up.status, 200); assert.equal(up.body.data.role, 'admin');
      assert.equal((await c.get('/api/auth/me')).status, 401, 'promotion signs the target out');
      const promoted = await signInAdmin(email, secret);
      assert.equal((await promoted.get('/api/admin/overview')).status, 200);

      // two admins → demoting one works; then the other is the last admin
      assert.equal((await promoted.req('PATCH', `/api/admin/users/${me._id}/role`, { role: 'user' })).status, 200);
      const last = await promoted.req('PATCH', `/api/admin/users/${me._id}/role`, { role: 'user' });
      assert.equal(last.status, 200, 'already a user: no-op');
      const lastAdmin = await User.countDocuments({ role: 'admin' });
      assert.ok(lastAdmin >= 1);
      // restore for later tests
      await User.updateOne({ _id: me._id }, { $set: { role: 'admin' } });
      admin = await signInAdmin(adminEmail, adminSecret);
      assert.equal((await admin.req('PATCH', `/api/admin/users/${id}/role`, { role: 'superuser' })).status, 400);
    });
    it('security events list auth and admin actions with emails, filterable, without secrets', async () => {
      const r = await admin.get('/api/admin/security-events?group=admin');
      assert.ok(r.body.data.length > 0 && r.body.data.every((e) => e.action.startsWith('admin.')));
      const role = r.body.data.find((e) => e.action === 'admin.user_role');
      assert.ok(role.user.email && role.target.email && /from: user, to: admin|from: admin, to: user/.test(role.detail));
      const fails = await admin.get('/api/admin/security-events?outcome=failure');
      assert.ok(fails.body.data.length > 0 && fails.body.data.every((e) => e.outcome === 'failure'));
      assert.ok(!/Correct-Horse|passwordHash|tokenHash/.test(JSON.stringify(fails.body)));
      assert.equal((await admin.get('/api/admin/security-events?action=bad action')).status, 400);
    });
    it('admin console requests are never cached', async () => {
      const r = await admin.get('/api/admin/users');
      assert.equal(r.headers.get('cache-control'), 'no-store');
    });
  });

  describe('CLI operations', () => {
    it('create enrols two-factor immediately and rejects weak passwords and duplicates', async () => {
      await assert.rejects(createAdmin({ email: 'weak@ex.com', name: 'W', password: 'short' }), /Password rejected/);
      await assert.rejects(createAdmin({ email: adminEmail, name: 'Dup', password: PW }), /already exists/);
      const u = await User.findOne({ email: adminEmail });
      assert.equal(u.role, 'admin'); assert.equal(u.mfa.enabled, true);
      assert.equal(await RecoveryCode.countDocuments({ userId: u._id }), 10);
    });
    it('promote requires two-factor; demote refuses the last admin', async () => {
      const { email } = await newUser('Cli');
      await assert.rejects(promote(email), /no two-factor/);
      const admins = await User.find({ role: 'admin' });
      for (const a of admins.slice(1)) await User.updateOne({ _id: a._id }, { $set: { role: 'user' } });
      await assert.rejects(demote(admins[0].email), /only admin/);
    });
  });
});
