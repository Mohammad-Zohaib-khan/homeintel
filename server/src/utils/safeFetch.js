import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppError } from './AppError.js';

/*
 * SSRF-safe outbound HTTP client.
 *  - https only, explicit host allowlist (no user-supplied hosts ever reach here unchecked)
 *  - every resolved IP checked against private/loopback/link-local/metadata ranges at connect time
 *    (custom DNS lookup ⇒ no DNS-rebinding window between check and connect)
 *  - no automatic redirects; bounded response size; timeouts; retries with backoff + Retry-After
 *  - per-host minimum spacing between requests (public-API politeness, e.g. Nominatim 1 req/s)
 */

const allowed = new Set();
export const allowHost = (host) => allowed.add(host.toLowerCase());
export const allowedHosts = () => [...allowed];

const BLOCKED_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const v4ToInt = (ip) => ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return BLOCKED_V4.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return x === '::' || x === '::1' || /^(fc|fd)/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff') || x.startsWith('64:ff9b:') || x.startsWith('2001:db8');
  }
  return true; // not an IP ⇒ refuse
}

export function assertSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new AppError(400, 'UNSAFE_URL', 'Invalid outbound URL'); }
  if (u.protocol !== 'https:') throw new AppError(400, 'UNSAFE_URL', 'Only https outbound requests are allowed');
  if (u.username || u.password) throw new AppError(400, 'UNSAFE_URL', 'Credentials in URLs are not allowed');
  if (u.port && u.port !== '443') throw new AppError(400, 'UNSAFE_URL', 'Non-standard ports are not allowed');
  const host = u.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, ''))) throw new AppError(400, 'UNSAFE_URL', 'IP-literal hosts are not allowed');
  if (!allowed.has(host)) throw new AppError(400, 'UNSAFE_URL', `Host not in outbound allowlist: ${host}`);
  return u;
}

function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: options.family || 4 }];
    const bad = list.find((a) => isPrivateIp(a.address));
    if (bad || !list.length) return cb(Object.assign(new Error('Resolved to a disallowed address'), { code: 'SSRF_BLOCKED' }));
    if (options.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

// Default transport: node:https with the validating lookup. Tests replace it via setTransport().
function httpsTransport({ url, method, headers, body, timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, lookup: safeLookup, timeout: timeoutMs }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) { req.destroy(Object.assign(new Error('Response too large'), { code: 'RESPONSE_TOO_LARGE' })); return; }
        chunks.push(c);
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
let transport = httpsTransport;
export const setTransport = (fn) => { transport = fn ?? httpsTransport; };

const lastCall = new Map();
async function respectSpacing(host, minIntervalMs) {
  if (!minIntervalMs) return;
  const wait = (lastCall.get(host) ?? 0) + minIntervalMs - Date.now();
  lastCall.set(host, Date.now() + Math.max(wait, 0));
  if (wait > 0) await sleep(wait);
}

export class ProviderError extends Error {
  constructor(message, { status, code = 'PROVIDER_ERROR', retryable = false } = {}) { super(message); this.status = status; this.code = code; this.retryable = retryable; }
}

/**
 * @returns {Promise<{status:number, json:any, text:string}>}
 */
export async function safeFetch(rawUrl, { method = 'GET', headers = {}, body, timeoutMs = 20000, maxBytes = 8 * 1024 * 1024, retries = 2, minIntervalMs = 0, expect = 'json' } = {}) {
  const u = assertSafeUrl(rawUrl);
  const h = { 'user-agent': 'HomeIntel/1.0 (neighborhood intelligence; contact via repository)', accept: expect === 'json' ? 'application/json' : '*/*', ...headers };
  if (body && !h['content-type']) h['content-type'] = 'application/x-www-form-urlencoded';
  let attempt = 0;
  for (;;) {
    await respectSpacing(u.hostname, minIntervalMs);
    let res;
    try {
      res = await transport({ url: u.toString(), method, headers: h, body, timeoutMs, maxBytes });
    } catch (e) {
      if (e.code === 'SSRF_BLOCKED' || e.code === 'RESPONSE_TOO_LARGE') throw new ProviderError(e.message, { code: e.code });
      if (attempt < retries) { attempt++; await sleep(500 * 2 ** attempt); continue; }
      throw new ProviderError(`Network error contacting ${u.hostname}`, { code: 'NETWORK_ERROR', retryable: true });
    }
    if (res.status >= 300 && res.status < 400) throw new ProviderError(`Unexpected redirect from ${u.hostname}`, { status: res.status, code: 'REDIRECT_BLOCKED' });
    if ([429, 502, 503, 504].includes(res.status) && attempt < retries) {
      attempt++;
      const ra = Number(res.headers?.['retry-after']);
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    if (res.status >= 400) throw new ProviderError(`${u.hostname} responded ${res.status}`, { status: res.status, code: res.status === 401 || res.status === 403 ? 'PROVIDER_AUTH' : 'PROVIDER_HTTP', retryable: res.status >= 500 || res.status === 429 });
    if (expect !== 'json') return { status: res.status, text: res.text };
    try { return { status: res.status, json: JSON.parse(res.text) }; } catch { throw new ProviderError(`${u.hostname} returned malformed JSON`, { code: 'PROVIDER_BAD_RESPONSE' }); }
  }
}
