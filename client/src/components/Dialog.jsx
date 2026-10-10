import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/** Modal dialog built on <dialog>: native focus trapping, Esc to close, focus restored to the opener. */
export default function Dialog({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null); const opener = useRef(null); const id = useId();
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { opener.current = document.activeElement; d.showModal(); }
    if (!open && d.open) { d.close(); opener.current?.focus?.(); }
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={id} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-lg border border-line bg-surface p-0 text-ink shadow-raise backdrop:bg-ink/40`}>
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={id} className="text-2xl">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"><X size={18} aria-hidden="true" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
