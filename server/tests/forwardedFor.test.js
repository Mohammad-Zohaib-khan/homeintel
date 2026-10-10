import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { stripForwardedPort, normalizeForwardedFor } from '../src/middleware/forwardedFor.js';

describe('X-Forwarded-For normalisation (Azure App Service appends ports)', () => {
  it('strips ports from IPv4 and bracketed IPv6 hops and leaves plain addresses alone', () => {
    assert.equal(stripForwardedPort('203.0.113.7:51234'), '203.0.113.7');
    assert.equal(stripForwardedPort('[2001:db8::1]:443, 10.0.0.4:8080'), '2001:db8::1, 10.0.0.4');
    assert.equal(stripForwardedPort('203.0.113.7, 2001:db8::1'), '203.0.113.7, 2001:db8::1');
  });

  it('gives Express the bare client IP behind one trusted proxy', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(normalizeForwardedFor);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const server = app.listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/ip`, { headers: { 'x-forwarded-for': '198.51.100.9:61000' } });
      assert.deepEqual(await res.json(), { ip: '198.51.100.9' });
    } finally { server.close(); }
  });
});
