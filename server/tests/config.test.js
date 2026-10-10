import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Boots the real config module in a child process with production settings.
// Import by file:// URL — a bare absolute path fails on Windows ("c:" is read as a URL scheme).
const envFile = new URL('../src/config/env.js', import.meta.url).href;
const boot = (extra) => spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(envFile)}).then(() => console.log('CONFIG_OK'))`], {
  env: { PATH: process.env.PATH, NODE_ENV: 'production', ...extra }, encoding: 'utf8', timeout: 10000,
});
const good = { JWT_ACCESS_SECRET: 'x'.repeat(48), MFA_ENCRYPTION_KEY: 'a'.repeat(64), CLIENT_ORIGINS: 'https://homeintel.example' };

describe('production configuration', () => {
  it('starts with strong secrets and https origins', () => { const r = boot(good); assert.match(r.stdout, /CONFIG_OK/, r.stderr); });
  it('refuses to start without secrets', () => { const r = boot({ CLIENT_ORIGINS: 'https://a.example' }); assert.notEqual(r.status, 0); assert.match(r.stderr, /Missing required production secrets: JWT_ACCESS_SECRET, MFA_ENCRYPTION_KEY/); });
  it('refuses weak secrets and malformed keys without echoing their values', () => {
    const r = boot({ ...good, JWT_ACCESS_SECRET: 'short-secret-value', MFA_ENCRYPTION_KEY: 'zz' });
    assert.notEqual(r.status, 0); assert.ok(!r.stderr.includes('short-secret-value')); assert.match(r.stderr, /JWT_ACCESS_SECRET/);
  });
  it('refuses plain-http client origins', () => { const r = boot({ ...good, CLIENT_ORIGINS: 'http://homeintel.example' }); assert.notEqual(r.status, 0); assert.match(r.stderr, /must use https/); });
  it('refuses the test-only mock AI provider', () => { const r = boot({ ...good, AI_PROVIDER: 'mock' }); assert.notEqual(r.status, 0); assert.match(r.stderr, /only permitted when NODE_ENV=test/); });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
describe('development secrets', () => {
  it('two separate processes (e.g. server + admin CLI) get the same generated keys, persisted owner-only', () => {
    const secretsFile = fileURLToPath(new URL('../.dev-secrets.json', import.meta.url));
    const existed = fs.existsSync(secretsFile);
    const read = () => spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(envFile)}).then(({ env }) => console.log(env.MFA_ENCRYPTION_KEY + ':' + env.JWT_ACCESS_SECRET.slice(0, 8)))`], {
      env: { PATH: process.env.PATH, NODE_ENV: 'development' }, encoding: 'utf8', timeout: 10000, cwd: os.tmpdir(),
    }).stdout.trim();
    const a = read(); const b = read();
    assert.match(a, /^[0-9a-f]{64}:[0-9a-f]{8}$/); assert.equal(a, b);
    // POSIX permission bits don't exist on Windows (NTFS reports 0o666), so check them on Unix only.
    if (process.platform !== 'win32') assert.equal(fs.statSync(secretsFile).mode & 0o077, 0, 'not readable by group/others');
    if (!existed) fs.unlinkSync(secretsFile);
    void path;
  });
});
