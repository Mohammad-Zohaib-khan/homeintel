import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { MapPinPlus } from 'lucide-react';
import { nb } from '../lib/endpoints.js';
import { useAuth } from '../lib/auth.jsx';
import { useResource } from '../lib/useResource.js';
import { Button, Alert } from './ui.jsx';
import { ListSkeleton } from './States.jsx';
import { useToast } from './Toast.jsx';

/** Finds a locality HomeIntel doesn't have yet via OpenStreetMap geocoding, then adds it and starts data collection. */
export default function LocalityLookup({ q }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const { data, error, loading } = useResource((s) => nb.lookup(q, s), [q], { enabled: !!user && q.trim().length >= 2 });

  if (!user) {
    return <p className="text-sm text-muted"><Link to={`/login?next=${encodeURIComponent(`/explore?q=${q}`)}`} className="font-medium text-accent underline underline-offset-4">Sign in</Link> to look up “{q}” on OpenStreetMap and add it to HomeIntel.</p>;
  }
  if (loading) return <ListSkeleton rows={2} label="Looking up locations" />;
  if (error) return <Alert>{error.message}</Alert>;
  if (!data?.length) return <p className="text-sm text-muted">OpenStreetMap has no matching locality in India for “{q}”. Check the spelling, or add the city name.</p>;

  async function add(c) {
    setBusy(c.ref);
    try {
      const r = await nb.create(q, c.ref);
      toast.success(`${r.neighborhood.name} added. Collecting data now.`);
      nav(`/neighborhood/${r.neighborhood.slug}`);
    } catch (e) { toast.error(e.message); setBusy(null); }
  }
  return (
    <ul className="divide-y divide-line rounded-md border border-line bg-surface">
      {data.map((c) => (
        <li key={c.ref} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1"><p className="font-medium">{c.name}</p><p className="truncate text-sm text-muted">{c.displayName}</p></div>
          {c.exists
            ? <Link to={`/neighborhood/${c.slug}`} className="text-sm font-medium text-accent underline-offset-4 hover:underline">Already in HomeIntel</Link>
            : <Button variant="secondary" loading={busy === c.ref} disabled={!!busy} onClick={() => add(c)} className="h-8 px-3 text-xs"><MapPinPlus size={14} aria-hidden="true" />Add and analyse</Button>}
        </li>
      ))}
    </ul>
  );
}
