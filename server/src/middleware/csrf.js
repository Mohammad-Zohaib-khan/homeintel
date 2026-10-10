import { COOKIE, setCsrfCookie } from '../utils/cookies.js';
import { randomToken, safeEqual } from '../utils/crypto.js';
import { AppError } from '../utils/AppError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

// Double-submit protection. The cookie is HttpOnly; the SPA obtains the value from GET /api/auth/csrf (readable
// only by allowed origins via CORS) and echoes it in X-CSRF-Token. A cross-site attacker can do neither.
export function csrfProtection(req, _res, next) {
  if (SAFE.has(req.method) || req.path.startsWith('/webhooks/')) return next(); // webhooks use signature verification
  const cookie = req.cookies?.[COOKIE.csrf];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !TOKEN_RE.test(header) || !safeEqual(cookie, header)) {
    return next(new AppError(403, 'CSRF_INVALID', 'Security token missing or invalid. Refresh and try again.'));
  }
  next();
}

export function issueCsrf(req, res) {
  let token = req.cookies?.[COOKIE.csrf];
  if (!token || !TOKEN_RE.test(token)) { token = randomToken(32); setCsrfCookie(res, token); }
  res.json({ data: { csrfToken: token } });
}
