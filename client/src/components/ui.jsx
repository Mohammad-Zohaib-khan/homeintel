import { useId, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useToast } from './Toast.jsx';

const variants = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  ghost: 'text-muted hover:text-ink hover:bg-sunken',
  danger: 'border border-bad/50 text-bad hover:bg-bad/10',
};
export function Button({ variant = 'primary', loading = false, className = '', children, disabled, type = 'button', ...rest }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium transition-[background,filter] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} {...rest}>
      {loading && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {children}
    </button>
  );
}

const inputCls = 'h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-faint transition-colors focus-visible:outline-2 aria-[invalid=true]:border-bad';
export function Field({ label, hint, error, children, id: given }) {
  const auto = useId(); const id = given || auto;
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, className: `${inputCls} ${error ? 'border-bad' : 'border-line'}` })}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-bad">{error}</p>}
    </div>
  );
}

export const TextField = ({ label, hint, error, ...input }) => <Field label={label} hint={hint} error={error}>{(p) => <input {...p} {...input} />}</Field>;

export function PasswordField({ label, hint, error, ...input }) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} hint={hint} error={error}>
      {(p) => (
        <div className="relative">
          <input {...p} {...input} type={shown ? 'text' : 'password'} className={`${p.className} pr-11`} />
          <button type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? 'Hide password' : 'Show password'}
            className="absolute right-1 top-1 grid h-8 w-9 place-items-center rounded text-muted hover:text-ink">
            {shown ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </button>
        </div>
      )}
    </Field>
  );
}

export function Alert({ tone = 'error', children }) {
  const tones = { error: 'border-bad/50 text-bad', info: 'border-line text-muted', success: 'border-good/50 text-good' };
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border bg-surface px-3.5 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function CopyButton({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800); toast.success('Copied to clipboard'); }
    catch { toast.error('Copy is blocked in this browser. Select the text and copy manually.'); }
  };
  return (
    <Button variant="secondary" onClick={copy} className="h-8 px-3 text-xs">
      {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{done ? 'Copied' : label}
    </Button>
  );
}

export const Skeleton = ({ className = '' }) => <div aria-hidden="true" className={`animate-pulse rounded bg-sunken motion-reduce:animate-none ${className}`} />;

// Maps server validation details ([{path,message}]) to a field→message record.
export const fieldErrors = (err) => Object.fromEntries((err?.details || []).map((d) => [d.path, d.message]));
