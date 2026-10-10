import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Search } from 'lucide-react';
import { nb } from '../lib/endpoints.js';
import { fmtScore, placeLine } from '../lib/format.js';

/** ARIA 1.2 combobox: type to search localities in HomeIntel; Enter opens the active option or the full results. */
export default function SearchBox({ size = 'md', autoFocus = false, placeholder = 'Search a locality, e.g. Kothrud or Indiranagar', initial = '', onSubmit, onSelect, id: idProp }) {
  const nav = useNavigate();
  const auto = useId(); const id = idProp || auto; const listId = `${id}-list`;
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const inputRef = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setItems([]); setState('idle'); return undefined; }
    const ctrl = new AbortController();
    setState('loading');
    const t = setTimeout(() => {
      nb.search({ q: term, limit: 6 }, ctrl.signal)
        .then((r) => { setItems(r.data); setActive(-1); setState('done'); })
        .catch((e) => { if (e.code !== 'ERR_CANCELED' && e.name !== 'CanceledError') setState('error'); });
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const go = (item) => { setOpen(false); if (onSelect) { onSelect(item); setQ(''); } else nav(`/neighborhood/${item.slug}`); };
  const submitAll = () => { setOpen(false); if (onSubmit) onSubmit(q.trim()); else nav(`/explore?q=${encodeURIComponent(q.trim())}`); };

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } else setQ(''); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && active >= 0 && items[active]) go(items[active]); else if (onSelect) { if (items[0]) go(items[0]); } else if (q.trim()) submitAll(); }
  }

  const big = size === 'lg';
  const showList = open && q.trim().length >= 2;
  return (
    <div className="relative w-full" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <label htmlFor={id} className="sr-only">Search localities</label>
      <div className={`flex items-center gap-2 rounded-md border border-line-strong bg-raised focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 ${big ? 'h-14 px-4' : 'h-10 px-3'}`}>
        <Search size={big ? 20 : 16} className="shrink-0 text-muted" aria-hidden="true" />
        <input ref={inputRef} id={id} type="search" role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} autoComplete="off" spellCheck="false" autoFocus={autoFocus}
          value={q} placeholder={placeholder} data-search-input="true"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint ${big ? 'text-lg' : 'text-sm'}`} />
        {state === 'loading' && <Loader2 size={16} className="animate-spin text-muted motion-reduce:animate-none" aria-hidden="true" />}
        {!big && <kbd className="hidden rounded-sm border border-line px-1.5 text-xs text-faint sm:inline" aria-hidden="true">/</kbd>}
      </div>
      {showList && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-line bg-raised shadow-raise">
          <ul id={listId} role="listbox" aria-label="Matching localities">
            {items.map((it, i) => (
              <li key={it.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()} onClick={() => go(it)} onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${i === active ? 'bg-accent-soft' : ''}`}>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{it.name}</span><span className="block truncate text-xs text-muted">{placeLine(it)}</span></span>
                <span className="num text-lg">{fmtScore(it.score.overall)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-2.5 text-sm" aria-live="polite">
            {state === 'error' && <span className="text-bad">Search is unavailable. Check your connection.</span>}
            {state === 'done' && !items.length && <span className="text-muted">No locality in HomeIntel matches “{q.trim()}”. </span>}
            {state !== 'error' && !onSelect && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={submitAll} className="font-medium text-accent underline-offset-4 hover:underline">
                {items.length ? 'See all results' : 'Search the map for it'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
