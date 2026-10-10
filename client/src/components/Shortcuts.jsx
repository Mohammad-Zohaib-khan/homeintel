import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import Dialog from './Dialog.jsx';

export const SHORTCUTS = [
  { keys: ['/'], label: 'Search localities' },
  { keys: ['g', 'e'], label: 'Go to Explore', to: '/explore' },
  { keys: ['g', 'c'], label: 'Go to Compare', to: '/compare' },
  { keys: ['g', 'p'], label: 'Go to Priorities', to: '/personalize' },
  { keys: ['g', 's'], label: 'Go to Saved', to: '/saved' },
  { keys: ['g', 'r'], label: 'Go to Reports', to: '/reports' },
  { keys: ['t'], label: 'Toggle light / dark theme' },
  { keys: ['?'], label: 'Show this list' },
];
const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function useShortcuts({ onToggleTheme }) {
  const nav = useNavigate();
  const [help, setHelp] = useState(false);
  const pending = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return;
      if (pending.current === 'g') {
        pending.current = null;
        const s = SHORTCUTS.find((x) => x.keys[0] === 'g' && x.keys[1] === e.key);
        if (s) { e.preventDefault(); nav(s.to); }
        return;
      }
      if (e.key === 'g') { pending.current = 'g'; setTimeout(() => { pending.current = null; }, 1200); return; }
      if (e.key === '/') { const input = document.querySelector('[data-search-input="true"]'); if (input) { e.preventDefault(); input.focus(); } else { e.preventDefault(); nav('/explore'); } }
      else if (e.key === '?') { e.preventDefault(); setHelp(true); }
      else if (e.key === 't') onToggleTheme();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nav, onToggleTheme]);
  return { help, setHelp };
}

export function ShortcutHelp({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="divide-y divide-line">
        {SHORTCUTS.map((s) => (
          <div key={s.label} className="flex items-center justify-between py-2.5 text-sm">
            <dt>{s.label}</dt>
            <dd className="flex gap-1">{s.keys.map((k, i) => <kbd key={i} className="min-w-6 rounded-sm border border-line-strong bg-raised px-1.5 text-center text-xs">{k}</kbd>)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-muted">Shortcuts are off while you type in a field.</p>
    </Dialog>
  );
}
