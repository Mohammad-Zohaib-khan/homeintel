import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { isPrivateIp, assertSafeUrl, safeFetch, setTransport, allowHost } = await import('../src/utils/safeFetch.js');
await import('../src/config/outbound.js');

after(() => setTransport(null));

describe('SSRF guard', () => {
  it('blocks private, loopback, link-local, metadata and mapped addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254', 'not-an-ip'])
      assert.equal(isPrivateIp(ip), true, ip);
  });
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '151.101.1.1', '2606:4700:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
  });
  it('rejects non-https, credentials, odd ports, IP literals and unlisted hosts', () => {
    for (const u of ['http://overpass-api.de/api/interpreter', 'https://user:pw@overpass-api.de/', 'https://overpass-api.de:8443/', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/', 'https://evil.example.com/', 'file:///etc/passwd', 'gopher://x'])
      assert.throws(() => assertSafeUrl(u), { code: 'UNSAFE_URL' }, u);
  });
  it('allows configured provider hosts', () => {
    for (const u of ['https://overpass-api.de/api/interpreter', 'https://api.openaq.org/v3/locations', 'https://api.data.gov.in/resource/x', 'https://nominatim.openstreetmap.org/search']) assert.ok(assertSafeUrl(u));
  });
});

describe('safeFetch behaviour', () => {
  allowHost('test.example');
  it('does not follow redirects', async () => {
    setTransport(async () => ({ status: 302, headers: { location: 'https://169.254.169.254/' }, text: '' }));
    await assert.rejects(safeFetch('https://test.example/x', { retries: 0 }), { code: 'REDIRECT_BLOCKED' });
  });
  it('retries 429/503 then succeeds', async () => {
    let n = 0;
    setTransport(async () => (++n < 3 ? { status: 503, headers: { 'retry-after': '0' }, text: '' } : { status: 200, headers: {}, text: '{"ok":true}' }));
    const r = await safeFetch('https://test.example/y', { retries: 2 });
    assert.deepEqual(r.json, { ok: true }); assert.equal(n, 3);
  });
  it('surfaces auth errors without retrying, and never echoes query strings', async () => {
    let n = 0;
    setTransport(async () => { n++; return { status: 403, headers: {}, text: '' }; });
    await assert.rejects(safeFetch('https://test.example/z?api-key=SECRET', { retries: 2 }), (e) => e.code === 'PROVIDER_AUTH' && !e.message.includes('SECRET'));
    assert.equal(n, 1);
  });
  it('rejects malformed JSON', async () => {
    setTransport(async () => ({ status: 200, headers: {}, text: '<html>' }));
    await assert.rejects(safeFetch('https://test.example/j', { retries: 0 }), { code: 'PROVIDER_BAD_RESPONSE' });
  });
  it('propagates SSRF blocks from the connect-time DNS check', async () => {
    setTransport(async () => { throw Object.assign(new Error('Resolved to a disallowed address'), { code: 'SSRF_BLOCKED' }); });
    await assert.rejects(safeFetch('https://test.example/r', { retries: 2 }), { code: 'SSRF_BLOCKED' });
  });
});
