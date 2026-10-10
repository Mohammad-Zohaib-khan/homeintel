import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { requireRole } = await import('../src/middleware/auth.js');
const { errorHandler } = await import('../src/middleware/errorHandler.js');

const run = (user, ...roles) => new Promise((resolve) => {
  const res = { status(s) { this.s = s; return this; }, json(b) { resolve({ status: this.s, body: b }); } };
  requireRole(...roles)({ user }, res, (err) => (err ? errorHandler(err, { path: '/x' }, res, () => {}) : resolve({ status: 200 })));
});

describe('requireRole', () => {
  it('allows listed roles', async () => assert.equal((await run({ role: 'admin' }, 'admin')).status, 200));
  it('forbids other roles with 403', async () => assert.equal((await run({ role: 'user' }, 'admin')).status, 403));
  it('forbids when no user is attached', async () => assert.equal((await run(undefined, 'admin')).status, 403));
});
