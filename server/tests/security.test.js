import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT_MAX = '3';
const { createApp } = await import('../src/app.js');

let server, base;
before(() => { server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

describe('HTTP hardening', () => {
  it('sets security headers and hides the framework', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });
  it('caps request body size (413)', async () => {
    const res = await fetch(`${base}/api/auth/csrf`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(200_000) }) });
    assert.equal(res.status, 413);
  });
  it('rejects malformed JSON with a structured 400', async () => {
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(res.status, 400); assert.equal((await res.json()).error.code, 'BAD_JSON');
  });
  it('rate-limits authentication endpoints (429 after the limit)', async () => {
    const c = await fetch(`${base}/api/auth/csrf`);
    const token = (await c.json()).data.csrfToken;
    const hit = () => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `hi_csrf=${token}`, 'x-csrf-token': token }, body: '{}' });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await hit()).status);
    assert.deepEqual(statuses.slice(0, 3), [400, 400, 400]);
    assert.ok(statuses.slice(3).every((x) => x === 429), `expected 429s after the limit, got ${statuses}`);
  });
  it('does not leak internals on unexpected errors', async () => {
    const res = await fetch(`${base}/api/auth/me`);
    assert.equal(res.status, 401);
    assert.ok(!JSON.stringify(await res.json()).match(/stack|mongoose|node_modules/i));
  });
});
