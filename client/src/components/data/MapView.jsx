import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { groupOf, POI_TYPE_LABEL } from '../../lib/poiTypes.js';
import { fmtDistance } from '../../lib/format.js';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Leaflet map. Props:
 *  pins: [{ id, lat, lng, label, title, demo }]  — neighborhoods (score pins)
 *  pois: [{ id, type, name, lat, lng, distanceM }] — amenities (dots)
 *  area: { lat, lng, radiusM } — analysis radius
 * The map is a supplement: every page that uses it also renders the same information as a list.
 */
export default function MapView({ pins = [], pois = [], area, activeId, onPinClick, className = '', label = 'Map', fit = true }) {
  const el = useRef(null); const map = useRef(null); const layers = useRef({});
  const click = useRef(onPinClick); click.current = onPinClick;

  useEffect(() => {
    if (!el.current || map.current) return undefined;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, keyboard: true });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION, crossOrigin: true }).addTo(m);
    m.setView([20.6, 78.9], 5);
    m.on('focus', () => m.scrollWheelZoom.enable()); m.on('blur', () => m.scrollWheelZoom.disable());
    layers.current = { pins: L.layerGroup().addTo(m), pois: L.layerGroup().addTo(m), area: L.layerGroup().addTo(m) };
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize()); ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const { pins: pl, pois: ol, area: al } = layers.current;
    pl.clearLayers(); ol.clearLayers(); al.clearLayers();
    const bounds = [];
    if (area) {
      L.circle([area.lat, area.lng], { radius: area.radiusM, color: 'rgb(29,94,74)', weight: 1.5, dashArray: '4 4', fillOpacity: 0.04, interactive: false }).addTo(al);
      const b = L.latLng(area.lat, area.lng).toBounds(area.radiusM * 2);
      bounds.push(b.getSouthWest(), b.getNorthEast());
    }
    for (const p of pois) {
      const g = groupOf(p.type); if (!g) continue;
      L.circleMarker([p.lat, p.lng], { radius: 5, color: '#fff', weight: 1.2, fillColor: g.color, fillOpacity: 0.95 })
        .bindTooltip(`<strong>${esc(p.name || POI_TYPE_LABEL[p.type])}</strong><br>${esc(POI_TYPE_LABEL[p.type])}, ${esc(fmtDistance(p.distanceM))}`, { direction: 'top' })
        .addTo(ol);
    }
    for (const p of pins) {
      const icon = L.divIcon({ className: '', html: `<div class="hi-pin" data-active="${p.id === activeId}" data-demo="${!!p.demo}" style="width:34px;height:34px"><span>${esc(p.label)}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34] });
      const mk = L.marker([p.lat, p.lng], { icon, title: p.title, alt: p.title, keyboard: true, riseOnHover: true }).addTo(pl);
      mk.on('click', () => click.current?.(p.id));
      mk.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') click.current?.(p.id); });
      bounds.push([p.lat, p.lng]);
    }
    if (fit && bounds.length) m.fitBounds(bounds, { padding: [36, 36], maxZoom: 15, animate: false });
  }, [pins, pois, area, activeId, fit]);

  return <div ref={el} role="region" aria-label={label} className={`isolate z-0 overflow-hidden rounded-md border border-line ${className}`} />;
}
