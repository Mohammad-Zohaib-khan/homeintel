import { env } from '../config/env.js';
import { ACCESS_TTL_S } from '../services/tokenService.js';

const base = { httpOnly: true, secure: env.isProd || env.COOKIE_SAMESITE === 'none', sameSite: env.COOKIE_SAMESITE, domain: env.COOKIE_DOMAIN };

export const COOKIE = { access: 'hi_at', refresh: 'hi_rt', mfa: 'hi_mfa', csrf: 'hi_csrf' };
// Narrow paths: the refresh token is only ever sent to /api/auth; the MFA challenge only to /api/auth/mfa.
export const PATHS = { access: '/api', refresh: '/api/auth', mfa: '/api/auth/mfa', csrf: '/api' };

export function setSessionCookies(res, { access, refresh }) {
  res.cookie(COOKIE.access, access, { ...base, path: PATHS.access, maxAge: ACCESS_TTL_S * 1000 });
  res.cookie(COOKIE.refresh, refresh, { ...base, path: PATHS.refresh, maxAge: 7 * 24 * 3600 * 1000 });
}
export const setMfaCookie = (res, token) => res.cookie(COOKIE.mfa, token, { ...base, path: PATHS.mfa, maxAge: 5 * 60 * 1000 });
export const setCsrfCookie = (res, token) => res.cookie(COOKIE.csrf, token, { ...base, path: PATHS.csrf, maxAge: 7 * 24 * 3600 * 1000 });
export function clearSessionCookies(res) {
  for (const k of ['access', 'refresh', 'mfa']) res.clearCookie(COOKIE[k], { ...base, path: PATHS[k] });
}
