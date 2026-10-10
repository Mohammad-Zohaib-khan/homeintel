import * as auth from '../services/authService.js';
import * as mfa from '../services/mfaService.js';
import { audit } from '../services/auditService.js';
import { clearSessionCookies, setSessionCookies, setMfaCookie, COOKIE, PATHS } from '../utils/cookies.js';
import { ok, created } from '../utils/respond.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

export const register = handle(async (req, res) => {
  const { user, tokens } = await auth.register(req, req.valid.body);
  setSessionCookies(res, tokens);
  created(res, { user: user.toPublic() });
});

export const login = handle(async (req, res) => {
  const r = await auth.login(req, req.valid.body);
  if (r.mfaRequired) { setMfaCookie(res, r.challenge); return ok(res, { mfaRequired: true }); }
  setSessionCookies(res, r.tokens);
  ok(res, { mfaRequired: false, user: r.user.toPublic() });
});

export const mfaLogin = handle(async (req, res) => {
  const { user, tokens } = await auth.completeMfaLogin(req, req.cookies?.[COOKIE.mfa], req.valid.body);
  res.clearCookie(COOKIE.mfa, { path: PATHS.mfa, httpOnly: true, secure: env.isProd || env.COOKIE_SAMESITE === 'none', sameSite: env.COOKIE_SAMESITE, domain: env.COOKIE_DOMAIN });
  setSessionCookies(res, tokens);
  ok(res, { user: user.toPublic() });
});

export const refresh = handle(async (req, res) => {
  try {
    const { user, tokens } = await auth.refresh(req, req.cookies?.[COOKIE.refresh]);
    setSessionCookies(res, tokens);
    ok(res, { user: user.toPublic() });
  } catch (e) { if (e instanceof AppError) clearSessionCookies(res); throw e; }
});

export const logout = handle(async (req, res) => {
  await auth.logout(req, req.cookies?.[COOKIE.refresh]);
  clearSessionCookies(res);
  ok(res, { loggedOut: true });
});

export const me = (req, res) => ok(res, { user: req.user.toPublic() });

export const changePassword = handle(async (req, res) => {
  const { user, tokens } = await auth.changePassword(req, req.user, req.valid.body);
  setSessionCookies(res, tokens);
  ok(res, { user: user.toPublic() });
});

export const mfaSetup = handle(async (req, res) => ok(res, await mfa.beginSetup(req.user._id)));
export const mfaEnable = handle(async (req, res) => {
  const recoveryCodes = await mfa.enable(req.user._id, req.valid.body.code);
  await audit(req, 'auth.mfa_enabled', { userId: req.user._id });
  ok(res, { recoveryCodes });
});
export const mfaDisable = handle(async (req, res) => { await auth.disableMfa(req, req.user, req.valid.body); ok(res, { mfaEnabled: false }); });
export const mfaStatus = handle(async (req, res) => ok(res, { enabled: req.user.mfa.enabled, recoveryCodesRemaining: req.user.mfa.enabled ? await mfa.remainingRecoveryCodes(req.user._id) : 0 }));

export const deleteAccount = handle(async (req, res) => { await auth.deleteAccount(req, req.user, req.valid.body); clearSessionCookies(res); ok(res, { deleted: true }); });
export const logoutAll = handle(async (req, res) => { await auth.logoutAll(req); clearSessionCookies(res); ok(res, { loggedOut: true }); });
