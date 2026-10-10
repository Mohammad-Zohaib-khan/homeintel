// Score bar styled as a cartographic scale bar. Decorative: always pair it with the printed number.
export default function ScaleBar({ value, tone, className = '' }) {
  return <div className={`scalebar ${className}`} data-tone={value == null ? 'muted' : tone} style={{ '--pct': value ?? 0 }} aria-hidden="true"><i /></div>;
}
