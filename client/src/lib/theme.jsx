import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { preferencesAllowed } from './consent.jsx';

const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0E1513' : '#EEF1EF');
    // A UI preference only (never a credential), stored only with the visitor's consent.
    try { if (preferencesAllowed()) localStorage.setItem('hi-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
