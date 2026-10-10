import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/*
 * Storage consent. HomeIntel sets only strictly necessary cookies (session + CSRF, HttpOnly) — those need no consent.
 * "Preferences" covers optional browser storage: remembered theme and the compare tray. No analytics or ad tracking exist.
 */
const KEY = 'hi-consent';
const OPTIONAL_KEYS = ['hi-theme', 'hi-compare'];
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v?.v === 1 ? v : null; } catch { return null; } };

const Ctx = createContext(null);
export const useConsent = () => useContext(Ctx);
export const preferencesAllowed = () => !!read()?.preferences;

export function ConsentProvider({ children }) {
  const [state, setState] = useState(read);
  const decide = useCallback((preferences) => {
    const v = { v: 1, preferences, at: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
      if (!preferences) OPTIONAL_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch { /* storage blocked: decision applies for this visit */ }
    setState(v);
  }, []);
  const value = useMemo(() => ({ decided: !!state, preferences: !!state?.preferences, decide, reopen: () => setState(null) }), [state, decide]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
