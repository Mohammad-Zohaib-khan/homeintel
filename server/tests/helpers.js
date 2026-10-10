import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.DISABLE_TTL_INDEXES = '1';
process.env.AUTH_RATE_LIMIT_MAX ??= '1000';
const BASE_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = `homeintel_test_${process.pid}_${Date.now()}`;

// Returns null (tests skip with a visible reason) when no database is reachable, unless REQUIRE_DB=1 (CI).
export async function connectTestDb() {
  try {
    mongoose.set('sanitizeFilter', true);
    await mongoose.connect(`${BASE_URI}/${dbName}`, { serverSelectionTimeoutMS: 2500 });
    return true;
  } catch (e) {
    if (process.env.REQUIRE_DB === '1') throw e;
    console.warn(`# SKIPPING DB TESTS: cannot reach MongoDB at ${BASE_URI} (${e.message}). Set REQUIRE_DB=1 to fail instead.`);
    return false;
  }
}
export async function disconnectTestDb() { try { await mongoose.connection.dropDatabase(); } catch { /* ignore */ } await mongoose.disconnect(); }

// Minimal browser-like client: cookie jar (path + expiry aware) and automatic CSRF header.
export class Client {
  constructor(base) { this.base = base; this.jar = new Map(); this.csrf = null; this.lastCookies = []; }
  cookieHeader(path) {
    return [...this.jar.values()].filter((c) => path.startsWith(c.path)).map((c) => `${c.name}=${c.value}`).join('; ');
  }
  store(res) {
    this.lastCookies = res.headers.getSetCookie();
    for (const raw of this.lastCookies) {
      const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
      const i = pair.indexOf('='); const name = pair.slice(0, i); const value = pair.slice(i + 1);
      const a = Object.fromEntries(attrs.map((x) => { const [k, ...v] = x.split('='); return [k.toLowerCase(), v.join('=') || true]; }));
      const expired = a['max-age'] === '0' || (a.expires && new Date(a.expires) < new Date()) || value === '';
      const key = `${name}|${a.path || '/'}`;
      if (expired) this.jar.delete(key); else this.jar.set(key, { name, value, path: a.path || '/' });
    }
  }
  async req(method, path, body, { csrf = true, headers = {} } = {}) {
    const h = { 'content-type': 'application/json', cookie: this.cookieHeader(path), ...headers };
    if (csrf && method !== 'GET') { await this.ensureCsrf(); h['x-csrf-token'] = this.csrf; h.cookie = this.cookieHeader(path); }
    const res = await fetch(this.base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    this.store(res);
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json, headers: res.headers };
  }
  async ensureCsrf() {
    if (this.csrf) return;
    const res = await fetch(`${this.base}/api/auth/csrf`, { headers: { cookie: this.cookieHeader('/api/auth/csrf') } });
    this.store(res);
    this.csrf = (await res.json()).data.csrfToken;
  }
  async upload(path, filename, content, type = 'text/csv') {
    await this.ensureCsrf();
    const fd = new FormData();
    fd.append('file', new Blob([content], { type }), filename);
    const res = await fetch(this.base + path, { method: 'POST', headers: { cookie: this.cookieHeader(path), 'x-csrf-token': this.csrf }, body: fd });
    this.store(res);
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  async raw(path) { const res = await fetch(this.base + path, { headers: { cookie: this.cookieHeader(path) } }); return { status: res.status, headers: res.headers, text: await res.text() }; }
  get = (p) => this.req('GET', p);
  post = (p, b, o) => this.req('POST', p, b, o);
  cookie(name) { return [...this.jar.values()].find((c) => c.name === name)?.value; }
}
