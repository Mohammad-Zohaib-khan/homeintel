import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MAX_COMPARE } from '@homeintel/shared';
import { preferencesAllowed } from './consent.jsx';

// The compare tray: up to four neighborhoods picked while browsing. Persisted only with preferences consent.
const Ctx = createContext(null);
export const useCompare = () => useContext(Ctx);
const load = () => { try { if (!preferencesAllowed()) return []; const v = JSON.parse(localStorage.getItem('hi-compare')); return Array.isArray(v) ? v.filter((x) => x && typeof x.slug === 'string' && typeof x.name === 'string').slice(0, MAX_COMPARE) : []; } catch { return []; } };

export function CompareProvider({ children }) {
  const [items, setItems] = useState(load);
  useEffect(() => { try { if (preferencesAllowed()) localStorage.setItem('hi-compare', JSON.stringify(items)); } catch { /* ignore */ } }, [items]);
  const has = useCallback((slug) => items.some((i) => i.slug === slug), [items]);
  const toggle = useCallback((n) => setItems((xs) => (xs.some((i) => i.slug === n.slug) ? xs.filter((i) => i.slug !== n.slug) : xs.length >= MAX_COMPARE ? xs : [...xs, { slug: n.slug, name: n.name, city: n.city }])), []);
  const remove = useCallback((slug) => setItems((xs) => xs.filter((i) => i.slug !== slug)), []);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, has, toggle, remove, clear, full: items.length >= MAX_COMPARE }), [items, has, toggle, remove, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
