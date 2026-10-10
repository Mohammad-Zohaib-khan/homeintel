import { User } from '../models/User.js';
import { verifyAccess } from '../services/tokenService.js';
import { COOKIE } from '../utils/cookies.js';
import { AppError } from '../utils/AppError.js';

// Authentication is always resolved server-side from the HttpOnly cookie, and the user is re-read from the
// database on every request so role changes and revoked sessions (tokenVersion) take effect immediately.
export async function requireAuth(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE.access];
    if (!token) throw AppError.unauthorized();
    let payload;
    try { payload = await verifyAccess(token); } catch { throw new AppError(401, 'TOKEN_EXPIRED', 'Session expired'); }
    const user = await User.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.ver) throw AppError.unauthorized();
    req.user = user;
    req.auth = { amr: payload.amr === 'mfa' ? 'mfa' : 'pwd' };
    next();
  } catch (e) { next(e); }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(AppError.forbidden('You do not have permission to do that'));

// Attaches req.user when a valid session exists; never rejects. For public endpoints that personalise.
export async function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE.access];
    if (token) {
      const payload = await verifyAccess(token).catch(() => null);
      if (payload) { const user = await User.findById(payload.sub); if (user && user.tokenVersion === payload.ver) req.user = user; }
    }
  } catch { /* anonymous */ }
  next();
}

/*
 * Admin gate (always after requireAuth). Requires: role 'admin', two-factor enabled on the account, AND a session
 * that was signed in with the second factor (amr 'mfa'). Together with two invariants enforced elsewhere —
 * (1) an account can only become admin if it already has two-factor (CLI enrols it at creation; promotion refuses
 * otherwise) and (2) admins cannot turn two-factor off — a stolen password alone can never reach admin functions.
 * Enrolling two-factor never upgrades the current session; the user must sign in again with a code.
 */
export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') return next(AppError.forbidden('You do not have permission to do that'));
  if (!req.user.mfa?.enabled) return next(new AppError(403, 'ADMIN_MFA_REQUIRED', 'Turn on two-factor sign-in to use the admin console.'));
  if (req.auth?.amr !== 'mfa') return next(new AppError(403, 'ADMIN_STEP_UP_REQUIRED', 'Sign out and sign in again with your authenticator code to open the admin console.'));
  next();
}
