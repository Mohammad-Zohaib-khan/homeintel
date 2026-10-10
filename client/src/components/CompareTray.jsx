import { Link, useLocation } from 'react-router';
import { X } from 'lucide-react';
import { MAX_COMPARE } from '@homeintel/shared';
import { useCompare } from '../lib/compare.jsx';

export default function CompareTray() {
  const { items, remove, clear } = useCompare();
  const { pathname } = useLocation();
  if (!items.length || pathname === '/compare') return null;
  const href = `/compare?ids=${items.map((i) => i.slug).join(',')}`;
  return (
    <aside aria-label="Compare tray" className="no-print fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 items-center gap-3 rounded-lg border border-line-strong bg-raised py-2 pl-4 pr-2 shadow-raise">
      <p className="hidden shrink-0 text-sm text-muted sm:block">Compare <span className="tnum">{items.length}/{MAX_COMPARE}</span></p>
      <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {items.map((i) => (
          <li key={i.slug} className="flex shrink-0 items-center gap-1 rounded-sm bg-sunken py-1 pl-2.5 pr-1 text-sm">
            {i.name}
            <button type="button" onClick={() => remove(i.slug)} aria-label={`Remove ${i.name} from compare`} className="grid h-5 w-5 place-items-center rounded-sm text-muted hover:text-ink"><X size={13} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={clear} className="shrink-0 px-2 text-sm text-muted hover:text-ink">Clear</button>
      {items.length >= 2
        ? <Link to={href} className="shrink-0 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:brightness-110">Compare</Link>
        : <span className="shrink-0 px-2 text-sm text-muted">Add one more</span>}
    </aside>
  );
}
