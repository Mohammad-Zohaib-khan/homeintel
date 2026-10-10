import { CATEGORIES } from '@homeintel/shared';
import { Sparkles } from 'lucide-react';
import ScaleBar from './data/ScaleBar.jsx';
import ContourScore from './data/ContourScore.jsx';
import { DemoBanner, OriginTag } from './data/Tags.jsx';
import { fmtDate, fmtScore } from '../lib/format.js';

/* Renders a stored report. All content is plain text from the server and rendered as text nodes only. */
const List = ({ items, empty }) => (items.length ? <ul className="list-disc space-y-1.5 pl-5">{items.map((x, i) => <li key={i}>{x.text ?? x}</li>)}</ul> : <p className="text-muted">{empty}</p>);

function NeighborhoodSection({ s, index }) {
  return (
    <section aria-labelledby={`rs-${index}`} className={`border-t-2 border-ink pt-6 ${index ? 'print-break' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h2 id={`rs-${index}`} className="text-4xl">{s.neighborhood.name}</h2>
          <p className="text-muted">{s.neighborhood.city}, {s.neighborhood.state}</p>
          <p className="mt-2 text-sm text-muted">Overall {fmtScore(s.overall)} of 100 ({s.band}). Coverage {Math.round(s.coverage * 100)}% of weighted categories.</p>
          {s.isDemo && <div className="mt-2"><OriginTag origin="seed" /></div>}
        </div>
        <ContourScore score={s.overall} seed={s.neighborhood.slug} size={150} demo={s.isDemo} animate={false} />
      </div>
      <table className="mt-6 w-full text-sm">
        <caption className="sr-only">Category scores for {s.neighborhood.name}</caption>
        <tbody>
          {s.categories.map((c) => (
            <tr key={c.id} className="border-t border-line">
              <th scope="row" className="w-48 py-2 text-left font-medium">{c.label}</th>
              <td className="py-2"><ScaleBar value={c.score} tone={s.isDemo ? 'demo' : undefined} /></td>
              <td className="num w-14 py-2 text-right text-lg">{fmtScore(c.score)}</td>
              <td className="w-20 py-2 pl-3 text-right text-xs text-muted">weight {c.weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div><h3 className="mb-2 text-2xl">Strengths</h3><List items={s.strengths} empty="No category scored 65 or above." /></div>
        <div><h3 className="mb-2 text-2xl">Concerns</h3><List items={s.concerns} empty="No category scored below 50." /></div>
      </div>
      <div className="mt-8"><h3 className="mb-2 text-2xl">Missing data</h3><List items={s.missing} empty="Every category has data." /></div>
      {s.caveats.length > 0 && <div className="mt-8 rounded-md border border-warn/40 bg-surface p-4"><h3 className="mb-2 text-xl">Read with care</h3><List items={s.caveats} empty="" /></div>}
      <details className="mt-8">
        <summary className="cursor-pointer font-medium">All {s.evidence.length} values behind this section</summary>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="text-left text-xs text-muted"><th className="py-1.5 font-normal">Metric</th><th className="py-1.5 text-right font-normal">Value</th><th className="py-1.5 pl-3 font-normal">Covers</th><th className="py-1.5 font-normal">Origin</th></tr></thead>
          <tbody>{s.evidence.map((e) => <tr key={e.key} className="border-t border-line align-top"><td className="py-1.5">{e.label}<span className="block text-xs text-muted">{e.category}</span></td><td className="tnum py-1.5 text-right">{e.value}</td><td className="py-1.5 pl-3 text-xs text-muted">{e.covers}. {e.scope}</td><td className="py-1.5"><OriginTag origin={e.origin} /></td></tr>)}</tbody></table></div>
      </details>
    </section>
  );
}

export default function ReportBody({ report }) {
  const c = report.content;
  const nameOf = Object.fromEntries(c.sections.map((s) => [s.neighborhood.id, s.neighborhood.name]));
  return (
    <div className="space-y-12">
      {report.containsDemoData && <DemoBanner />}
      {c.comparison && (
        <section aria-labelledby="rc-h">
          <h2 id="rc-h" className="text-4xl">At a glance</h2>
          {c.comparison.summary && <p className="mt-3 max-w-prose">{c.comparison.summary}</p>}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">Category scores side by side</caption>
              <thead><tr className="text-left"><th scope="col" className="py-2 font-normal text-muted">Category</th>{c.sections.map((s) => <th key={s.neighborhood.id} scope="col" className="py-2 text-right font-display text-lg font-semibold">{s.neighborhood.name}</th>)}</tr></thead>
              <tbody>
                <tr className="border-t-2 border-ink"><th scope="row" className="py-2 text-left font-medium">Overall</th>{c.sections.map((s) => <td key={s.neighborhood.id} className="num py-2 text-right text-2xl">{fmtScore(s.overall)}</td>)}</tr>
                {c.comparison.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line"><th scope="row" className="py-2 text-left font-normal">{r.label}</th>
                    {r.values.map((v) => <td key={v.id} className={`num py-2 text-right text-lg ${r.leaders.includes(nameOf[v.id]) ? 'text-accent' : ''}`}>{fmtScore(v.score)}{r.leaders.includes(nameOf[v.id]) && <span className="sr-only"> (leads)</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-5 space-y-1.5 text-sm">{c.comparison.tradeoffs.map((t) => <li key={t.name}><span className="font-medium">{t.name}</span>: ahead on {t.strengths.join(', ').toLowerCase() || 'nothing by 5+ points'}; behind on {t.gaps.join(', ').toLowerCase() || 'nothing by 5+ points'}.</li>)}</ul>
        </section>
      )}

      {c.aiNarrative && (
        <section aria-labelledby="ai-h" className="rounded-lg border border-line bg-surface p-6">
          <h2 id="ai-h" className="flex items-center gap-2 text-3xl"><Sparkles size={20} className="text-accent" aria-hidden="true" />Written summary</h2>
          <p className="mt-1 text-xs text-muted">Generated by the research assistant ({c.aiNarrative.provider}) from this report’s data only. It cannot change scores. Check claims against the sections below.</p>
          <div className="mt-4 space-y-3">{c.aiNarrative.paragraphs.map((p, i) => <p key={i} className="max-w-prose">{p}</p>)}</div>
          {c.aiNarrative.uncertainties?.length > 0 && <div className="mt-4"><h3 className="text-lg">Uncertain or missing</h3><List items={c.aiNarrative.uncertainties} empty="" /></div>}
        </section>
      )}

      {c.sections.map((s, i) => <NeighborhoodSection key={s.neighborhood.id} s={s} index={i} />)}

      <section aria-labelledby="m-h" className="border-t border-line pt-6 text-sm">
        <h2 id="m-h" className="text-2xl">Method and sources</h2>
        <p className="mt-2 max-w-prose text-muted">{c.method}</p>
        <p className="mt-2 text-muted">Priorities used: {CATEGORIES.map((k) => `${k.label} ${c.weights[k.id]}`).join(', ')}.</p>
        <ul className="mt-3 space-y-1">{(c.sources ?? []).map((s) => <li key={s.key}>{s.name}. {s.provider}. Licence: {s.license}.{s.url && <> <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">{s.url}</a></>}</li>)}</ul>
        <p className="mt-4 max-w-prose text-muted">{c.disclaimer}</p>
        <p className="mt-2 text-xs text-faint">Generated {fmtDate(c.generatedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}. Scoring rules v{report.scoringVersion}.</p>
      </section>
    </div>
  );
}
