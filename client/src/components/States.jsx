import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from './ui.jsx';

export function EmptyState({ title, children, action, icon: Icon, level = 2 }) {
  const H = `h${level}`;
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-line-strong bg-surface/60 px-6 py-8">
      {Icon && <Icon size={22} className="text-faint" aria-hidden="true" />}
      <H className="text-xl">{title}</H>
      {children && <div className="max-w-prose text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'This section could not load' }) {
  const offline = error?.code === 'NETWORK_ERROR';
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-bad/40 bg-surface px-6 py-6">
      <p className="flex items-center gap-2 font-medium text-bad"><AlertCircle size={18} aria-hidden="true" />{title}</p>
      <p className="text-sm text-muted">{offline ? 'HomeIntel cannot reach its server. Check your connection, then retry.' : error?.message || 'Unexpected error.'}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry} className="h-8 px-3 text-xs"><RotateCw size={14} aria-hidden="true" />Retry</Button>}
    </div>
  );
}

export const Skeleton = ({ className = '' }) => <div aria-hidden="true" className={`animate-pulse rounded-sm bg-sunken motion-reduce:animate-none ${className}`} />;

export function ListSkeleton({ rows = 5, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 py-4"><Skeleton className="h-10 w-10" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-6 w-12" /></div>
      ))}
    </div>
  );
}
