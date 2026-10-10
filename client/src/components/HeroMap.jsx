import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import L from 'leaflet';
import ContourScore from './data/ContourScore.jsx';
import { OriginTag } from './data/Tags.jsx';
import { Skeleton } from './States.jsx';
import { useResource } from '../lib/useResource.js';
import { nb } from '../lib/endpoints.js';
import { fmtScore, placeLine, fmtDistance } from '../lib/format.js';
import { POI_GROUPS, POI_TYPE_LABEL, groupOf } from '../lib/poiTypes.js';

/*
 * Home banner: a live OpenStreetMap view of the top-scoring localities with their real amenities (from the API),
 * the locality's score card floating on top, and a switcher that flies between localities. A slow tour runs until
 * the visitor interacts; it is off under reduced motion. Everything on the map is also available as buttons/text.
 */
// Esri Light Gray Canvas (keyless). tile.openstreetmap.org blocks production sites under its usage policy and
// CARTO now requires an API key. Native tiles stop at zoom 16; Leaflet upscales beyond that.
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors Tiles &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const TOUR_MS = 9000;
// Leaflet writes colours as SVG attributes, which can't read CSS variables, so resolve the theme token first.
const token = (name) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).join(',')})`;

export default function HeroMap({ children }) {
  const { data, error, loading } = useResource((s) => nb.search({ sort: 'score', limit: 4 }, s), []);
  const places = useMemo(() => data?.data ?? [], [data]);
  const [idx, setIdx] = useState(0);
  const [touring, setTouring] = useState(() => !reducedMotion());
  const [hidden, setHidden] = useState(() => new Set());
  const place = places[idx];
  const pois = useResource((s) => (place ? nb.pois(place.slug, {}, s) : Promise.resolve([])), [place?.slug]);
  const poiList = useMemo(() => (Array.isArray(pois.data) ? pois.data : []), [pois.data]);
  const counts = useMemo(() => Object.fromEntries(POI_GROUPS.map((g) => [g.id, poiList.filter((p) => g.types.includes(p.type)).length])), [poiList]);

  const el = useRef(null); const map = useRef(null); const layer = useRef(null); const panel = useRef(null); const side = useRef(null);

  useEffect(() => {
    if (!el.current || map.current) return undefined;
    const fine = window.matchMedia?.('(pointer: fine)').matches;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, dragging: !!fine, tap: false, keyboard: true, zoomSnap: 0.25 });
    L.tileLayer(TILE_URL, { maxZoom: 19, maxNativeZoom: 16, attribution: ATTRIBUTION, crossOrigin: true }).addTo(m);
    L.control.zoom({ position: 'bottomleft' }).addTo(m);
    m.setView([20.6, 78.9], 5);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize()); ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  // Centre the locality in the open gap between the text panel and the score column on wide screens. Nearby
  // localities get a short flight; distant ones (another city) cross-fade, so no blank tiles show mid-flight.
  useEffect(() => {
    const m = map.current; if (!m || !place) return undefined;
    const z = 14.75;
    const wide = window.matchMedia?.('(min-width: 1024px)').matches;
    const shift = wide && panel.current && side.current ? (panel.current.offsetWidth - side.current.offsetWidth) / 2 : 0;
    const target = m.unproject(m.project([place.lat, place.lng], z).subtract([shift, 0]), z);
    const far = m.getCenter().distanceTo(target) > 40_000;
    if (reducedMotion()) { m.setView(target, z, { animate: false }); return undefined; }
    if (!far) { m.flyTo(target, z, { duration: 1.6, easeLinearity: 0.2 }); return undefined; }
    const node = el.current; node.style.opacity = '0';
    const t = setTimeout(() => { m.setView(target, z, { animate: false }); node.style.opacity = '1'; }, 320);
    return () => { clearTimeout(t); node.style.opacity = '1'; };
  }, [place]);

  useEffect(() => {
    const m = map.current; const g = layer.current; if (!m || !g || !place) return;
    g.clearLayers();
    const accent = token('--accent');
    L.circle([place.lat, place.lng], { radius: place.radiusM || 1500, color: accent, weight: 1.5, dashArray: '5 6', fillColor: accent, fillOpacity: 0.05, interactive: false }).addTo(g);
    for (const p of poiList) {
      const grp = groupOf(p.type); if (!grp || hidden.has(grp.id)) continue;
      L.circleMarker([p.lat, p.lng], { radius: 4.5, color: '#fff', weight: 1.2, fillColor: grp.color, fillOpacity: 0.95 })
        .bindTooltip(`<strong>${esc(p.name || POI_TYPE_LABEL[p.type])}</strong><br>${esc(POI_TYPE_LABEL[p.type])}, ${esc(fmtDistance(p.distanceM))} from the centre`, { direction: 'top' })
        .addTo(g);
    }
    const icon = L.divIcon({ className: '', html: `<div class="hi-pin" data-active="true" data-demo="${!!place.score?.dataMix?.isDemo}" style="width:40px;height:40px"><span>${esc(fmtScore(place.score?.overall))}</span></div>`, iconSize: [40, 40], iconAnchor: [20, 40] });
    L.marker([place.lat, place.lng], { icon, title: place.name, alt: `${place.name}, score ${fmtScore(place.score?.overall)}`, keyboard: false, interactive: false }).addTo(g);
  }, [place, poiList, hidden]);

  // Slow tour until the visitor interacts.
  useEffect(() => {
    if (!touring || places.length < 2) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % places.length), TOUR_MS);
    return () => clearInterval(t);
  }, [touring, places.length]);

  const choose = (i) => { setTouring(false); setIdx(i); };
  const toggle = (id) => { setTouring(false); setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const demo = !!place?.score?.dataMix?.isDemo;

  return (
    <section aria-labelledby="hero" className="hero-map relative mb-16 mt-2 flex flex-col overflow-hidden rounded-lg border border-line-strong bg-sunken shadow-raise lg:block lg:h-[44rem]"
      onPointerDown={() => setTouring(false)}>
      <div ref={el} role="region" aria-label={place ? `Live map of ${place.name} with nearby amenities` : 'Live map of India'}
        className="isolate z-0 order-2 h-[22rem] w-full transition-opacity duration-300 sm:h-[26rem] lg:absolute lg:inset-0 lg:h-full" />

      <div ref={panel} className="relative z-10 order-1 border-b border-line bg-surface px-6 py-9 sm:px-10 lg:absolute lg:bottom-6 lg:left-6 lg:top-6 lg:flex lg:w-[31rem] lg:flex-col lg:justify-center lg:rounded-md lg:border lg:py-10 lg:shadow-raise">
        {children}
      </div>

      <div ref={side} className="relative z-10 order-3 grid gap-4 p-4 sm:p-6 lg:absolute lg:bottom-6 lg:right-6 lg:top-6 lg:flex lg:w-[22rem] lg:flex-col lg:justify-between lg:p-0">
        {/* locality switcher */}
        <div role="group" aria-label="Top localities" className="rounded-md border border-line bg-surface p-1.5 shadow-raise">
          {loading && <Skeleton className="h-9 w-full" />}
          {error && <p className="px-2 py-1.5 text-sm text-muted">Localities could not be loaded. Refresh the page to try again.</p>}
          {!loading && !error && !places.length && <p className="px-2 py-1.5 text-sm text-muted">No localities are loaded yet.</p>}
          <div className="grid grid-cols-2 gap-1">
            {places.map((p, i) => (
              <button key={p.slug} type="button" aria-pressed={i === idx} onClick={() => choose(i)}
                className={`flex items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-left text-sm transition-colors ${i === idx ? 'bg-ink text-surface' : 'text-ink hover:bg-sunken'}`}>
                <span className="truncate">{p.name}</span><span className="num text-base">{fmtScore(p.score?.overall)}</span>
              </button>
            ))}
          </div>
          {touring && places.length > 1 && (
            <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-line" aria-hidden="true"><div key={idx} className="hero-tour h-full bg-accent" style={{ animationDuration: `${TOUR_MS}ms` }} /></div>
          )}
        </div>

        {/* floating score card */}
        <div className="rounded-md border border-line bg-surface p-4 shadow-raise" aria-live="polite">
          {!place ? (
            <div aria-busy={loading}><Skeleton className="h-6 w-2/3" /><Skeleton className="mt-3 h-24 w-full" /></div>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <ContourScore score={place.score.overall} seed={place.slug} size={104} demo={demo} />
                <div className="min-w-0 pt-1">
                  <p className="font-display text-2xl font-semibold leading-tight">{place.name}</p>
                  <p className="text-sm text-muted">{placeLine(place)}</p>
                  {demo && <div className="mt-2"><OriginTag origin="seed" /></div>}
                </div>
              </div>
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-sm text-muted">{pois.loading ? 'Loading amenities…' : `${poiList.length} mapped amenities from OpenStreetMap. Choose which to show.`}</p>
                <div role="group" aria-label="Amenity types on the map" className="mt-2 flex flex-wrap gap-1.5">
                  {!pois.loading && POI_GROUPS.filter((g) => counts[g.id]).map((g) => {
                    const on = !hidden.has(g.id);
                    return (
                      <button key={g.id} type="button" aria-pressed={on} onClick={() => toggle(g.id)}
                        className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs transition-colors ${on ? 'border-line-strong bg-surface text-ink' : 'border-line bg-sunken text-muted line-through'}`}>
                        <span className="h-2 w-2 rounded-full" style={{ background: g.color, opacity: on ? 1 : 0.35 }} aria-hidden="true" />
                        {g.label}<span className="num text-faint">{counts[g.id]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <Link to={`/neighborhood/${place.slug}`} className="mt-4 inline-flex font-medium text-accent underline-offset-4 hover:underline">Open the full profile of {place.name}</Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
