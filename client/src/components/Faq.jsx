import { ChevronDown } from 'lucide-react';

export default function Faq({ items }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map(([q, a]) => (
        <details key={q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-[1.05rem] font-medium marker:hidden [&::-webkit-details-marker]:hidden">
            {q}
            <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="max-w-prose pb-5 text-muted">{a}</div>
        </details>
      ))}
    </div>
  );
}
