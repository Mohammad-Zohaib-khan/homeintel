import { Link } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { ErrorState } from '../../components/States.jsx';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, MinusCircle, XCircle } from 'lucide-react';

export const PROVIDER_LABEL = { overpass: 'OpenStreetMap', air: 'Air quality', crime: 'Crime' };
export const ACTION_LABEL = {
  'auth.register': 'Account created', 'auth.login': 'Sign-in', 'auth.mfa_login': 'Sign-in, second step', 'auth.logout': 'Signed out', 'auth.logout_all': 'Signed out everywhere',
  'auth.refresh_reuse_detected': 'Stolen session blocked', 'auth.password_change': 'Password changed', 'auth.mfa_enabled': 'Two-factor turned on', 'auth.mfa_disabled': 'Two-factor turned off',
  'auth.account_deleted': 'Account deleted', 'admin.locality_refresh': 'Locality refresh started', 'admin.refresh_stale': 'Stale refresh started', 'admin.user_unlock': 'Account unlocked',
  'admin.user_sign_out': 'User signed out everywhere', 'admin.user_role': 'Role changed', 'admin.cli_create': 'Admin created (CLI)', 'admin.cli_promote': 'Promoted to admin (CLI)', 'admin.cli_demote': 'Admin removed (CLI)',
  'neighborhood.create': 'Locality added', 'neighborhood.refresh': 'Locality refresh requested', 'saved.create': 'Neighborhood saved', 'saved.delete': 'Saved item removed', 'saved.import': 'Shortlist imported',
  'report.create': 'Report created', 'report.delete': 'Report deleted', 'report.share': 'Report shared', 'report.unshare': 'Report link turned off', 'ai.analyze': 'Research request',
};
export const QUALITY_LABEL = { STALE: 'Stale value', LOW_CONFIDENCE: 'Low confidence', COARSE_GRANULARITY: 'City/district-level value', CONTRADICTION: 'Sources disagree', DEMO_DATA: 'Demo data', PROVIDER_FAILED: 'Provider failed' };

const STATUS = {
  success: ['text-good', CheckCircle2, 'Succeeded'], complete: ['text-good', CheckCircle2, 'Complete'], live: ['text-good', CheckCircle2, 'Source-backed'],
  failed: ['text-bad', XCircle, 'Failed'], partial: ['text-warn', AlertTriangle, 'Partial'], demo: ['text-demo', AlertTriangle, 'Demo data'],
  skipped: ['text-muted', MinusCircle, 'Skipped'], never: ['text-faint', CircleDashed, 'Never run'], idle: ['text-faint', CircleDashed, 'Idle'], empty: ['text-bad', CircleDashed, 'No data'],
  running: ['text-accent', Loader2, 'Running'], queued: ['text-accent', Loader2, 'Queued'],
};
/** Status shown as icon + word (never colour alone). */
export function Status({ value, label }) {
  const [cls, Icon, word] = STATUS[value] ?? ['text-muted', CircleDashed, value];
  const spin = value === 'running' || value === 'queued';
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${cls}`}><Icon size={14} aria-hidden="true" className={spin ? 'animate-spin motion-reduce:animate-none' : ''} />{label ?? word}</span>;
}

export function Pager({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      <button type="button" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Previous</button>
      <span className="tnum text-muted">Page {meta.page} of {meta.pages}, {meta.total} total</span>
      <button type="button" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Next</button>
    </nav>
  );
}

export function Segmented({ label, value, onChange, options }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map(([v, l]) => (
        <button key={v || 'all'} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded-sm border px-2.5 py-1 text-sm ${value === v ? 'border-ink bg-ink text-surface' : 'border-line bg-surface hover:border-line-strong'}`}>{l}</button>
      ))}
    </div>
  );
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');


/** Explains admin-specific refusals (two-factor missing / step-up needed) instead of a generic error. */
export function AdminError({ error, onRetry }) {
  if (error?.code === 'ADMIN_MFA_REQUIRED' || error?.code === 'ADMIN_STEP_UP_REQUIRED') {
    return (
      <div role="alert" className="flex max-w-2xl gap-3 rounded-md border border-warn/50 bg-surface px-5 py-4">
        <ShieldAlert size={20} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <div>
          <p className="font-medium">{error.code === 'ADMIN_MFA_REQUIRED' ? 'Turn on two-factor sign-in first' : 'Sign in again with your authenticator code'}</p>
          <p className="mt-1 text-sm text-muted">{error.message}</p>
          <p className="mt-2 text-sm">{error.code === 'ADMIN_MFA_REQUIRED'
            ? <Link to="/account" className="font-medium text-accent underline underline-offset-4">Go to Account</Link>
            : 'Admin access needs a session that was signed in with a second factor, not just a password.'}</p>
        </div>
      </div>
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}
