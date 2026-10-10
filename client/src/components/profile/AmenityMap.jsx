import { useMemo, useState } from 'react';
import MapView from '../data/MapView.jsx';
import { POI_GROUPS, POI_TYPE_LABEL } from '../../lib/poiTypes.js';
import { fmtDistance } from '../../lib/format.js';
import { ErrorState, Skeleton } from '../States.jsx';
import { OriginTag } from '../data/Tags.jsx';

export default function AmenityMap({ n, pois }) {
  const [hidden, setHidden] = useState(() => new Set());
  const [view, setView] = useState('map');
  const visible = useMemo(() => (pois.data ?? []).filter((p) => !hidden.has(POI_GROUPS.find((g) => g.types.includes(p.type))?.id)), [pois.data, hidden]);
  const nearest = useMemo(() => {
    const out = [];
    for (const g of POI_GROUPS) for (const t of g.types) { const p = (pois.data ?? []).find((x) => x.type === t); out.push({ type: t, group: g, p, count1km: (pois.data ?? []).filter((x) => x.type === t && x.distanceM <= 1000).length }); }
    return out;
  }, [pois.data]);
  const area = useMemo(() => ({ lat: n.lat, lng: n.lng, radiusM: n.radiusM }), [n]);
  const origin = pois.data?.[0]?.origin;

  if (pois.error) return <ErrorState error={pois.error} onRetry={pois.reload} title="Amenities could not load" />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Show amenity types on the map</legend>
          {POI_GROUPS.map((g) => {
            const on = !hidden.has(g.id);
            return (
              <label key={g.id} className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 text-xs ${on ? 'border-line-strong bg-raised' : 'border-line text-faint'}`}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => setHidden((s) => { const x = new Set(s); if (x.has(g.id)) x.delete(g.id); else x.add(g.id); return x; })} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? g.color : 'transparent', boxShadow: `inset 0 0 0 1.5px ${g.color}` }} aria-hidden="true" />{g.label}
              </label>
            );
          })}
        </fieldset>
        <div role="group" aria-label="View" className="flex rounded-md border border-line p-0.5 text-sm">
          {['map', 'list'].map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-sm px-3 py-1 capitalize ${view === v ? 'bg-ink text-surface' : 'text-muted'}`}>{v}</button>)}
        </div>
      </div>
      {pois.loading && !pois.data ? <Skeleton className="h-[420px] w-full" />
        : view === 'map' ? <MapView pins={[]} pois={visible} area={area} className="h-[420px]" label={`Map of amenities around ${n.name}`} />
        : (
          <table className="w-full text-sm">
            <caption className="sr-only">Nearest amenity of each type around {n.name}</caption>
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2 font-normal">Type</th><th className="py-2 font-normal">Nearest</th><th className="py-2 text-right font-normal">Distance</th><th className="py-2 text-right font-normal">Within 1 km</th></tr></thead>
            <tbody>
              {nearest.map(({ type, group, p, count1km }) => (
                <tr key={type} className="border-b border-line">
                  <td className="py-2"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: group.color }} aria-hidden="true" />{POI_TYPE_LABEL[type]}</td>
                  <td className="py-2 text-muted">{p ? p.name || 'Unnamed' : 'None mapped within 3 km'}</td>
                  <td className="tnum py-2 text-right">{p ? fmtDistance(p.distanceM) : '—'}</td>
                  <td className="tnum py-2 text-right">{count1km}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {origin && <OriginTag origin={origin} />}
        Dashed circle: the {fmtDistance(n.radiusM)} analysis radius. {visible.length} of {pois.data?.length ?? 0} amenities shown. Counts reflect what is mapped in OpenStreetMap, which can be incomplete.
      </p>
    </div>
  );
}
