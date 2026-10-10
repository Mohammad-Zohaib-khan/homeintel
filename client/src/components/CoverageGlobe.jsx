import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useResource } from '../lib/useResource.js';
import { nb } from '../lib/endpoints.js';
import { fmtScore } from '../lib/format.js';
import { Skeleton } from './States.jsx';

// three.js is large: load the globe only when this section scrolls near the viewport.
const Globe3D = lazy(() => import('./ui/3d-globe.jsx').then((m) => ({ default: m.Globe3D })));

class GlobeBoundary extends Component {
  constructor(p) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function useNearViewport(ref) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!ref.current || near) return undefined;
    if (!('IntersectionObserver' in window)) { setNear(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '150px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, near]);
  return near;
}

/** "Where HomeIntel has data": every locality as a marker on a 3D globe, with the same list as plain links. */
export default function CoverageGlobe() {
  const nav = useNavigate();
  const ref = useRef(null);
  const near = useNearViewport(ref);
  const [active, setActive] = useState(null);
  const [webgl, setWebgl] = useState(true);
  const { data, error } = useResource((s) => nb.search({ sort: 'name', limit: 50 }, s), []);
  const items = data?.data ?? [];
  useEffect(() => { import('./ui/3d-globe.jsx').then((m) => setWebgl(m.webglAvailable())).catch(() => setWebgl(false)); }, []);

  const markers = useMemo(() => items.map((i) => ({
    id: i.slug, lat: i.lat, lng: i.lng, label: i.name, sublabel: fmtScore(i.score.overall),
    ariaLabel: `${i.name}, ${i.city}: score ${fmtScore(i.score.overall)}. Open profile`,
    color: i.score.dataMix.isDemo ? 'rgb(var(--demo))' : 'rgb(var(--accent))',
  })), [items]);
  const byCity = useMemo(() => {
    const m = new Map();
    for (const i of items) { if (!m.has(i.city)) m.set(i.city, []); m.get(i.city).push(i); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);
  // The camera's vertical field of view fixes the globe's height, so narrow screens need the camera further back.
  const narrow = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches;
  const config = useMemo(() => ({ focus: { lat: 22, lng: 79 }, cameraDistance: narrow ? 4.4 : 3.3, minDistance: narrow ? 6 : 4.2, maxDistance: narrow ? 11 : 9 }), [narrow]);
  if (error || (data && !items.length)) return null;

  const listFallback = <p className="text-sm text-muted">The interactive globe needs WebGL, which isn’t available in this browser. Every locality is listed alongside.</p>;
  return (
    <section ref={ref} aria-labelledby="coverage-h" className="border-t border-line py-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface">
          {!webgl ? <div className="grid h-[420px] place-items-center p-8">{listFallback}</div>
            : near ? (
              <GlobeBoundary fallback={<div className="grid h-[420px] place-items-center p-8">{listFallback}</div>}>
                <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
                  <Globe3D className="h-[420px] sm:h-[480px]" markers={markers} config={config} activeId={active} label="Globe showing every locality HomeIntel covers"
                    onMarkerClick={(m) => nav(`/neighborhood/${m.id}`)} onMarkerHover={(m) => setActive(m?.id ?? null)} />
                </Suspense>
              </GlobeBoundary>
            ) : <Skeleton className="h-[420px] w-full" />}
          <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-muted">Drag to turn, scroll to zoom. Amber markers show demo data.</p>
        </div>
        <div>
          <h2 id="coverage-h" className="text-4xl">Where HomeIntel has data</h2>
          <p className="mt-3 max-w-md text-muted">{items.length} localities across {byCity.length} cities so far. Signed-in users can add any Indian locality from Explore.</p>
          <ul className="mt-6 space-y-3 text-sm">
            {byCity.map(([city, list]) => (
              <li key={city}>
                <span className="font-medium">{city}</span>
                <span className="text-muted">: </span>
                {list.map((i, k) => (
                  <span key={i.slug}>
                    <Link to={`/neighborhood/${i.slug}`} onMouseEnter={() => setActive(i.slug)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i.slug)} onBlur={() => setActive(null)}
                      className={`underline decoration-1 underline-offset-4 ${active === i.slug ? 'text-accent decoration-accent' : 'text-muted decoration-line-strong hover:text-ink'}`}>{i.name}</Link>{k < list.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
