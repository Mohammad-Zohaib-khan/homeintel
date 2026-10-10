import { useState } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import { fmtNumber } from '../lib/format.js';

function Cite({ id, item }) {
  const [open, setOpen] = useState(false);
  if (!item) return null;
  const text = item.kind === 'metric'
    ? `${item.neighborhood}: ${item.label} = ${fmtNumber(item.value, 1)} ${item.unit === 'count' ? '' : item.unit}. Covers: ${item.coverage}. ${item.origin}.`
    : `${item.neighborhood}: ${item.category} score ${item.score ?? 'no data'} (${item.band}).`;
  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-1 rounded-sm border border-line bg-sunken px-1 text-[0.7rem] leading-4 text-muted hover:border-accent hover:text-accent" aria-label={`Evidence ${id}`}>{id}</button>
      {open && <span role="note" className="absolute left-0 top-full z-20 mt-1 block w-72 rounded-md border border-line bg-raised p-3 text-xs text-ink shadow-raise">{text}</span>}
    </span>
  );
}

/** Renders a validated AI run. Text is rendered as text; citations open the stored evidence they point to. */
export default function AiResult({ run }) {
  if (run.status === 'failed') return <p role="alert" className="flex items-start gap-2 text-sm text-bad"><AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{run.error} The scores and evidence on this page are unaffected.</p>;
  const o = run.output; const idx = o.evidenceIndex ?? {};
  const items = [...(o.findings ?? []), ...(o.tradeoffs ?? [])];
  return (
    <div className="space-y-4">
      {o.paragraphs.map((p, i) => <p key={i} className="max-w-prose">{p}</p>)}
      {items.length > 0 && <ul className="max-w-prose list-disc space-y-2 pl-5">{items.map((f, i) => <li key={i}>{f.text}{f.evidence.map((e) => <Cite key={e} id={e} item={idx[e]} />)}</li>)}</ul>}
      {o.uncertainties?.length > 0 && <div><p className="text-sm font-medium">Uncertain or missing</p><ul className="mt-1 max-w-prose list-disc space-y-1 pl-5 text-sm text-muted">{o.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><Sparkles size={13} aria-hidden="true" />Written by {run.provider}{run.model ? ` (${run.model})` : ''} from HomeIntel’s stored evidence only.{run.citations?.dropped ? ` ${run.citations.dropped} citation${run.citations.dropped > 1 ? 's' : ''} that didn’t match stored evidence ${run.citations.dropped > 1 ? 'were' : 'was'} removed.` : ''} It cannot change scores.</p>
    </div>
  );
}
