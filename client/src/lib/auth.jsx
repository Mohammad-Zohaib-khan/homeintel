import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, authEvents, unwrap } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  useEffect(() => {
    let live = true;
    unwrap(api.get('/auth/me')).then((d) => live && setState({ status: 'authed', user: d.user }))
      .catch(() => live && setState({ status: 'anon', user: null }));
    const onExpired = () => setState({ status: 'anon', user: null });
    authEvents.addEventListener('expired', onExpired);
    return () => { live = false; authEvents.removeEventListener('expired', onExpired); };
  }, []);

  const adopt = (d) => { setState({ status: 'authed', user: d.user }); return d.user; };
  const login = useCallback(async (email, password) => {
    const d = await unwrap(api.post('/auth/login', { email, password }));
    return d.mfaRequired ? { mfaRequired: true } : { mfaRequired: false, user: adopt(d) };
  }, []);
  const mfaLogin = useCallback(async (factor) => adopt(await unwrap(api.post('/auth/mfa/login', factor))), []);
  const register = useCallback(async (body) => adopt(await unwrap(api.post('/auth/register', body))), []);
  const logout = useCallback(async () => { try { await api.post('/auth/logout', {}); } finally { setState({ status: 'anon', user: null }); } }, []);
  const reload = useCallback(async () => adopt(await unwrap(api.get('/auth/me'))), []);

  const value = useMemo(() => ({ ...state, login, mfaLogin, register, logout, reload }), [state, login, mfaLogin, register, logout, reload]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
