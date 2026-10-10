import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/app.js');

test('health endpoint returns envelope', async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'ok');
  assert.equal(res.headers.get('x-powered-by'), null);
  server.close();
});

test('unknown route returns structured 404', async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/nope`);
  const body = await res.json();
  assert.equal(res.status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
  server.close();
});

test('disallowed CORS origin is rejected', async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  server.close();
});
