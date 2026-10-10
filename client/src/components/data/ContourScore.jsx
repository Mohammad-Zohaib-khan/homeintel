import { useMemo } from 'react';
import { scoreBand } from '@homeintel/shared';

// Seeded PRNG so a neighborhood always draws the same "terrain".
function rng(seed) { let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function contourPath(cx, cy, r, harmonics, steps = 72) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const k = 1 + harmonics.reduce((a, [amp, n, ph]) => a + amp * Math.sin(n * th + ph), 0);
    const x = cx + r * k * Math.cos(th); const y = cy + r * k * Math.sin(th);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

/**
 * The overall score drawn as topographic contours: one contour per 10 points, like elevation on a survey map.
 * The number and band are always printed — the drawing never carries meaning alone.
 */
export default function ContourScore({ score, seed = 'x', size = 220, demo = false, label = 'Overall score', animate = true }) {
  const lines = score == null ? 0 : Math.max(1, Math.round(score / 10));
  const paths = useMemo(() => {
    const r = rng(seed);
    const base = Array.from({ length: 3 }, (_, i) => [0.05 + r() * 0.07, 2 + i + Math.floor(r() * 2), r() * Math.PI * 2]);
    const c = size / 2;
    return Array.from({ length: 10 }, (_, i) => {
      const t = 1 - i / 10; // outer → inner
      const harm = base.map(([a, n, p]) => [a * (0.35 + t * 0.65), n, p + i * 0.18]);
      return contourPath(c + (1 - t) * size * 0.025, c - (1 - t) * size * 0.02, (size * 0.47) * (0.5 + 0.5 * t), harm);
    });
  }, [seed, size]);
  const band = scoreBand(score);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={score == null ? `${label}: not enough data` : `${label}: ${Math.round(score)} out of 100, ${band}${demo ? ', based on demo data' : ''}`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" className="absolute inset-0">
        {paths.map((d, i) => {
          const on = i < lines;
          return (
            <path key={i} d={d} fill="none" pathLength="1"
              stroke={on ? `rgb(var(${demo ? '--demo' : '--contour'}))` : 'rgb(var(--line))'}
              strokeWidth={on ? (i % 5 === 4 ? 2 : 1.1) : 0.8}
              strokeDasharray={on ? undefined : '0.012 0.012'}
              opacity={on ? 0.35 + (i / 10) * 0.65 : 0.9}
              style={animate && on ? { strokeDasharray: 1, strokeDashoffset: 1, animation: `hi-draw .9s ${0.06 * i}s cubic-bezier(.3,.6,.2,1) forwards` } : undefined} />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center" aria-hidden="true">
        <span className="num text-[3.4rem] leading-none font-semibold">{score == null ? '—' : Math.round(score)}</span>
        <span className="mt-1 text-sm text-muted">{band}</span>
      </div>
    </div>
  );
}
