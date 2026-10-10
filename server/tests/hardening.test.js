import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.WEBHOOK_SIGNING_SECRET = 'w'.repeat(40);
process.env.WEBHOOK_SIGNING_SECRET_PREVIOUS = 'p'.repeat(40);
process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
process.env.JWT_ACCESS_SECRET_PREVIOUS = 'b'.repeat(48);
process.env.MFA_ENCRYPTION_KEY = 'c'.repeat(64);
process.env.MFA_ENCRYPTION_KEY_PREVIOUS = 'd'.repeat(64);
process.env.ONDEMAND_INGESTION = '0';
process.env.SERVE_CLIENT = '1';
import { connectTestDb, disconnectTestDb, Client } from './helpers.js';

const dbUp = await connectTestDb();
const { createApp } = await import('../src/app.js');
const { sign } = await import('../src/middleware/webhookSignature.js');
const { upsertLocality } = await import('../src/services/localityService.js');
const { WebhookReceipt } = await import('../src/models/WebhookReceipt.js');
const { decrypt, encrypt } = await import('../src/utils/crypto.js');
const { SignJWT } = await import('jose');

let server, base;
const post = (body, sig) => fetch(`${base}/api/webhooks/ingestion`, { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'x-homeintel-signature': sig } : {}) }, body });

describe('key rotation (pure)', () => {
  it('decrypts secrets written with the previous MFA key', () => {
    const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', Buffer.from('d'.repeat(64), 'hex'), iv);
    const ct = Buffer.concat([c.update('JBSWY3DPEHPK3PXP', 'utf8'), c.final()]);
    const blob = ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
    assert.equal(decrypt(blob), 'JBSWY3DPEHPK3PXP');
    assert.equal(decrypt(encrypt('x')), 'x');
    const parts = blob.split('.'); const ctb = Buffer.from(parts[3], 'base64url'); ctb[0] ^= 0x01; parts[3] = ctb.toString('base64url');
    assert.throws(() => decrypt(parts.join('.')), 'tampered ciphertext must fail authentication');
  });
});

describe('hardening (DB)', { skip: !dbUp && 'MongoDB unavailable' }, () => {
  before(async () => {
    await WebhookReceipt.init();
    await upsertLocality({ name: 'Kothrud', city: 'Pune', state: 'Maharashtra', lat: 18.5, lng: 73.8 }, { origin: 'seed' });
    server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { server?.close(); await disconnectTestDb(); });

  it('accepts a correctly signed webhook (no CSRF needed) and rejects replays', async () => {
    const body = JSON.stringify({ event: 'ingestion.refresh', neighborhoods: ['kothrud-pune', 'nope'] });
    const sig = sign('w'.repeat(40), body);
    const r = await post(body, sig);
    assert.equal(r.status, 200); const j = await r.json();
    assert.equal(j.data.accepted, true);
    assert.equal((await post(body, sig)).status, 409, 'replay rejected');
  });
  it('accepts the previous secret during rotation', async () => {
    const body = JSON.stringify({ event: 'ingestion.refresh_stale', olderThanHours: 1 });
    assert.equal((await post(body, sign('p'.repeat(40), body))).status, 200);
  });
  it('rejects missing, malformed, wrong, tampered and stale signatures', async () => {
    const body = JSON.stringify({ event: 'ingestion.refresh', neighborhoods: ['kothrud-pune'] });
    assert.equal((await post(body)).status, 401);
    assert.equal((await post(body, 'sha256=abc')).status, 401);
    assert.equal((await post(body, sign('x'.repeat(40), body))).status, 401);
    assert.equal((await post(body.replace('kothrud', 'kothrux'), sign('w'.repeat(40), body))).status, 401);
    assert.equal((await post(body, sign('w'.repeat(40), body, Math.floor(Date.now() / 1000) - 3600))).status, 401);
  });
  it('validates webhook payloads strictly (no URLs or extra fields)', async () => {
    const body = JSON.stringify({ event: 'ingestion.refresh', neighborhoods: ['kothrud-pune'], url: 'http://169.254.169.254' });
    assert.equal((await post(body, sign('w'.repeat(40), body))).status, 400);
  });

  it('accepts access tokens signed with the previous JWT secret during rotation, rejects unknown keys', async () => {
    const cl = new Client(base);
    await cl.post('/api/auth/register', { email: `rot${Date.now()}@ex.com`, name: 'R', password: 'Correct-Horse-9-Battery' });
    const me = await cl.get('/api/auth/me');
    const { User } = await import('../src/models/User.js');
    const u = await User.findById(me.body.data.user.id);
    const mk = (secret) => new SignJWT({ ver: u.tokenVersion, typ: 'access' }).setProtectedHeader({ alg: 'HS256' }).setSubject(String(u._id)).setIssuer('homeintel').setAudience('homeintel-api').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(secret));
    const call = async (tok) => (await fetch(`${base}/api/auth/me`, { headers: { cookie: `hi_at=${tok}` } })).status;
    assert.equal(await call(await mk('b'.repeat(48))), 200);
    assert.equal(await call(await mk('z'.repeat(48))), 401);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: String(u._id), ver: 0, typ: 'access', iss: 'homeintel', aud: 'homeintel-api' })).toString('base64url')}.`;
    assert.equal(await call(none), 401, 'alg=none rejected');
  });

  it('sign out everywhere revokes every session', async () => {
    const email = `all${Date.now()}@ex.com`; const PW = 'Correct-Horse-9-Battery';
    const a = new Client(base); await a.post('/api/auth/register', { email, name: 'A', password: PW });
    const b = new Client(base); await b.post('/api/auth/login', { email, password: PW });
    assert.equal((await a.post('/api/auth/logout-all', {})).status, 200);
    assert.equal((await b.get('/api/auth/me')).status, 401);
    assert.equal((await b.post('/api/auth/refresh', {})).status, 401);
  });

  it('adds request ids and a permissions policy; serves the SPA with a strict CSP when enabled', async () => {
    const r = await fetch(`${base}/api/health`);
    assert.match(r.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    assert.match(r.headers.get('permissions-policy'), /geolocation=\(\)/);
    const spa = await fetch(`${base}/explore`);
    if (spa.status === 200) {
      const csp = spa.headers.get('content-security-policy');
      assert.match(csp, /script-src 'self'(;|$)/); assert.match(csp, /frame-ancestors 'none'/); assert.ok(!/unsafe-eval/.test(csp));
      assert.match(await spa.text(), /<div id="root">/);
    }
    assert.equal((await fetch(`${base}/api/does-not-exist`)).status, 404);
  });
});

describe('log masking (pure)', () => {
  it('masks capability tokens in logged paths', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../src/middleware/requestLog.js', import.meta.url), 'utf8');
    const mask = new Function(`return ${src.match(/const mask = (\(p\) => [^;]+);/)[1]}`)();
    assert.equal(mask('/api/reports/shared/abcdefghijklmnopqrstuvwxyz012345'), '/api/reports/shared/[TOKEN]');
    assert.equal(mask('/share/reports/abcdefghijklmnopqrstuvwxyz012345'), '/share/reports/[TOKEN]');
  });
});
