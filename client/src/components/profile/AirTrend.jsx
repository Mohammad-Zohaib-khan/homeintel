import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, ErrorState, Skeleton } from '../States.jsx';
import { OriginTag } from '../data/Tags.jsx';
import { fmtDate, fmtNumber } from '../../lib/format.js';

const month = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

export default function AirTrend({ history, stationLabel }) {
  const [table, setTable] = useState(false);
  if (history.error) return <ErrorState error={history.error} onRetry={history.reload} title="Air-quality history could not load" />;
  if (history.loading && !history.data) return <Skeleton className="h-64 w-full" />;
  const rows = history.data ?? [];
  if (!rows.length) return <EmptyState level={3} title="No air-quality history yet">The nearest monitoring station has not published monthly PM2.5 history, or air-quality ingestion has not run for this locality.</EmptyState>;
  const vals = rows.map((r) => r.value);
  const latest = rows.at(-1); const min = rows[vals.indexOf(Math.min(...vals))]; const max = rows[vals.indexOf(Math.max(...vals))];
  const firstYear = vals.slice(0, Math.min(12, vals.length)); const lastYear = vals.slice(-Math.min(12, vals.length));
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const change = rows.length >= 24 ? ((avg(lastYear) - avg(firstYear)) / avg(firstYear)) * 100 : null;
  const data = rows.map((r) => ({ t: month(r.observedAt), v: r.value }));
  const summary = `Monthly average PM2.5 from ${fmtDate(rows[0].observedAt, { month: 'short', year: 'numeric' })} to ${fmtDate(latest.observedAt, { month: 'short', year: 'numeric' })}. Lowest ${fmtNumber(min.value, 1)} µg/m³ in ${month(min.observedAt)}, highest ${fmtNumber(max.value, 1)} in ${month(max.observedAt)}.${change != null ? ` The latest 12 months average ${change >= 0 ? `${fmtNumber(change, 0)}% higher` : `${fmtNumber(-change, 0)}% lower`} than the first 12.` : ''} The national 24-hour standard is 60 µg/m³.`;

  return (
    <div>
      <p className="mb-3 max-w-prose text-sm text-muted">{summary}</p>
      {table ? (
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm"><caption className="sr-only">Monthly PM2.5</caption>
            <thead className="sticky top-0 bg-surface"><tr className="text-left text-xs text-muted"><th className="px-3 py-2 font-normal">Month</th><th className="px-3 py-2 text-right font-normal">PM2.5 (µg/m³)</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.observedAt} className="border-t border-line"><td className="px-3 py-1.5">{fmtDate(r.observedAt, { month: 'long', year: 'numeric' })}</td><td className="tnum px-3 py-1.5 text-right">{fmtNumber(r.value, 1)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="h-64" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} accessibilityLayer={false}>
              <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'rgb(var(--line-strong))' }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
              <ReferenceLine y={60} stroke="rgb(var(--warn))" strokeDasharray="4 4" label={{ value: 'Standard 60', position: 'insideTopRight', fill: 'rgb(var(--warn))', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'rgb(var(--raised))', border: '1px solid rgb(var(--line))', borderRadius: 5, fontSize: 13 }} labelStyle={{ color: 'rgb(var(--muted))' }} formatter={(v) => [`${fmtNumber(v, 1)} µg/m³`, 'PM2.5']} />
              <Line type="monotone" dataKey="v" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        <OriginTag origin={latest.origin} /><span>{stationLabel}</span>
        <button type="button" onClick={() => setTable((t) => !t)} className="ml-auto text-accent underline underline-offset-4">{table ? 'Show chart' : 'Show as table'}</button>
      </div>
    </div>
  );
}
