import { CATEGORIES } from '@homeintel/shared';

const WORDS = ['Ignore', 'Minor', 'Some', 'Moderate', 'Important', 'Essential'];

/** One slider per category (0–5). Each value is also spelled out so it isn't conveyed by position alone. */
export default function WeightSliders({ weights, onChange, compact = false }) {
  return (
    <div className={compact ? 'space-y-3' : 'divide-y divide-line border-y border-line'}>
      {CATEGORIES.map((c) => {
        const v = weights[c.id] ?? 0;
        const id = `w-${c.id}`;
        return (
          <div key={c.id} className={`grid items-center gap-x-4 gap-y-1 ${compact ? 'grid-cols-[1fr_auto]' : 'py-4 sm:grid-cols-[14rem_1fr_6.5rem]'}`}>
            <label htmlFor={id} className="font-medium">{c.label}{!compact && <span className="block text-xs font-normal text-muted">{c.description}</span>}</label>
            <input id={id} type="range" min="0" max="5" step="1" value={v} onChange={(e) => onChange({ ...weights, [c.id]: Number(e.target.value) })}
              aria-valuetext={`${v} of 5, ${WORDS[v]}`} className={`h-2 w-full cursor-pointer accent-[rgb(var(--accent))] ${compact ? 'col-span-2' : ''}`} />
            <span className={`text-sm tnum ${compact ? 'col-start-2 row-start-1 text-muted' : 'text-right'}`}><span className="num text-lg text-ink">{v}</span> {WORDS[v]}</span>
          </div>
        );
      })}
    </div>
  );
}
