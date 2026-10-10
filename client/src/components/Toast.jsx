import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const dismiss = useCallback((i) => setItems((xs) => xs.filter((x) => x.id !== i)), []);
  const push = useCallback((message, tone = 'info') => {
    const i = ++id.current;
    setItems((xs) => [...xs.slice(-3), { id: i, message, tone }]);
    setTimeout(() => dismiss(i), tone === 'error' ? 8000 : 4500);
  }, [dismiss]);
  const api = useMemo(() => ({ success: (m) => push(m, 'success'), error: (m) => push(m, 'error'), info: (m) => push(m, 'info') }), [push]);
  const bar = { success: 'bg-good', error: 'bg-bad', info: 'bg-accent' };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex w-full max-w-sm overflow-hidden rounded-md border border-line bg-surface shadow-raise">
            <span className={`w-1 shrink-0 ${bar[t.tone]}`} aria-hidden="true" />
            <p className="flex-1 px-3 py-2.5 text-sm">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="px-2.5 text-muted hover:text-ink"><X size={15} aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
