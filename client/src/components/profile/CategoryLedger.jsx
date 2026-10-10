import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import ScaleBar from '../data/ScaleBar.jsx';
import { StatusTag, GranularityTag, OriginTag, FreshnessTag } from '../data/Tags.jsx';
import { fmtScore } from '../../lib/format.js';

function CategoryRow({ c, demo }) {
  const [open, setOpen] = useState(false);
  const has = c.score != null;
  const panelId = `cat-${c.id}`;
  return (
    <li className="border-b border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-4 text-left sm:grid-cols-[13rem_1fr_3.5rem_1.25rem]">
        <span>
          <span className="block font-medium">{c.label}</span>
          <span className="text-xs text-muted">{has ? `${c.band}, weight ${c.weight} of 5` : 'No data'}</span>
        </span>
        <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">{has ? <ScaleBar value={c.score} tone={demo ? 'demo' : undefined} /> : <span className="text-sm text-muted">Not scored</span>}</span>
        <span className="num text-right text-[1.65rem] leading-none sm:row-start-auto">{fmtScore(c.score)}</span>
        <ChevronDown size={18} aria-hidden="true" className={`hidden text-muted transition-transform sm:block ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!open} className="pb-5 sm:pl-[13rem]">
        {!has ? <p className="max-w-prose text-sm text-muted">{c.note}</p> : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5"><StatusTag status={c.status} />{c.granularities?.map((g) => <GranularityTag key={g} granularity={g} />)}{c.origins?.map((o) => <OriginTag key={o} origin={o} />)}</div>
            <table className="w-full text-sm">
              <caption className="sr-only">How the {c.label} score was calculated</caption>
              <thead><tr className="text-left text-xs text-muted"><th className="pb-1.5 font-normal">Metric</th><th className="pb-1.5 font-normal">Rule</th><th className="pb-1.5 text-right font-normal">Score</th><th className="pb-1.5 text-right font-normal">Adds</th></tr></thead>
              <tbody>
                {c.metrics.map((m) => (
                  <tr key={m.key} className="border-t border-line align-top">
                    <td className="py-2 pr-3 font-medium">{m.label} <FreshnessTag freshness={m.freshness} /></td>
                    <td className="py-2 pr-3 text-muted">{m.explanation}</td>
                    <td className="num py-2 text-right text-base">{fmtScore(m.score)}</td>
                    <td className="num py-2 pl-3 text-right text-base text-muted">{m.contribution.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Coverage {Math.round(c.coverage * 100)}% of this category’s metrics, confidence {Math.round(c.confidence * 100)}%. {c.note ?? ''}</p>
          </>
        )}
      </div>
    </li>
  );
}

export default function CategoryLedger({ score }) {
  const demo = score.dataMix.isDemo;
  const sorted = [...score.categories].sort((a, b) => (a.score == null) - (b.score == null) || b.weight - a.weight);
  return (
    <div>
      <ul className="border-t border-line">{sorted.map((c) => <CategoryRow key={c.id} c={c} demo={demo} />)}</ul>
      <p className="mt-3 max-w-prose text-xs text-muted">{score.method} Scoring rules v{score.version}.</p>
    </div>
  );
}
