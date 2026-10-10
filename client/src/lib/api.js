import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
// Cookie-based auth: credentials are HttpOnly cookies set by the server. No token is ever readable by JS.
export const api = axios.create({ baseURL, withCredentials: true, timeout: 15000 });
const bare = axios.create({ baseURL, withCredentials: true, timeout: 15000 }); // no interceptors (csrf + refresh calls)

// CSRF token lives in memory only; fetched lazily and echoed in X-CSRF-Token on state-changing requests.
let csrfToken = null;
const getCsrf = async () => (csrfToken ??= (await bare.get('/auth/csrf')).data.data.csrfToken);
const UNSAFE = /^(post|put|patch|delete)$/i;

api.interceptors.request.use(async (config) => {
  if (UNSAFE.test(config.method || '')) config.headers['X-CSRF-Token'] = await getCsrf();
  return config;
});

// Single-flight refresh: concurrent 401s share one refresh call.
let refreshing = null;
const refreshSession = () => (refreshing ??= bare.post('/auth/refresh', {}, { headers: { 'X-CSRF-Token': csrfToken } })
  .finally(() => { refreshing = null; }));
const NO_REFRESH = /\/auth\/(login|register|refresh|mfa\/login|csrf)$/;

export const authEvents = new EventTarget();

function normalise(err) {
  const e = err.response?.data?.error;
  const out = new Error(e?.message || (err.code === 'ECONNABORTED' ? 'The request timed out.' : 'Cannot reach the HomeIntel API.'));
  out.code = e?.code || 'NETWORK_ERROR';
  out.status = err.response?.status;
  out.details = e?.details;
  return out;
}

api.interceptors.response.use((r) => r, async (err) => {
  const cfg = err.config;
  const code = err.response?.data?.error?.code;
  if (cfg && code === 'CSRF_INVALID' && !cfg._csrfRetried) {
    cfg._csrfRetried = true; csrfToken = null; cfg.headers['X-CSRF-Token'] = await getCsrf();
    return api(cfg);
  }
  if (cfg && err.response?.status === 401 && !cfg._refreshed && !NO_REFRESH.test(cfg.url || '') && code !== 'MFA_INVALID') {
    cfg._refreshed = true;
    try { await getCsrf(); await refreshSession(); return api(cfg); }
    catch { authEvents.dispatchEvent(new Event('expired')); }
  }
  return Promise.reject(normalise(err));
});

export const unwrap = (p) => p.then((r) => r.data.data);
