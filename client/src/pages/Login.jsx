import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert, Button, PasswordField, TextField } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { safeNext } from '../lib/safeRedirect.js';

export default function Login() {
  useDocumentTitle('Sign in');
  const { login, mfaLogin, user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ email: '', password: '' });
  const [step, setStep] = useState('credentials');
  const [useRecovery, setUseRecovery] = useState(false);
  const [factor, setFactor] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && !busy) return <Navigate to={next} replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      if (step === 'credentials') {
        const r = await login(form.email, form.password);
        if (r.mfaRequired) { setStep('mfa'); setBusy(false); return; }
      } else {
        await mfaLogin(useRecovery ? { recoveryCode: factor.trim() } : { code: factor.replace(/\D/g, '') });
      }
      nav(next, { replace: true });
    } catch (err) {
      setError(err.code === 'VALIDATION_ERROR' ? (err.details?.[0]?.message ?? 'Check what you entered and try again.') : err.message);
      if (err.code === 'MFA_CHALLENGE_EXPIRED') { setStep('credentials'); setFactor(''); }
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Welcome back." intro="Sign in to reopen your saved neighborhoods, comparisons and reports.">
      <form onSubmit={submit} noValidate className="space-y-5" aria-label="Sign in">
        {error && <Alert>{error}</Alert>}
        {step === 'credentials' ? (
          <>
            <TextField label="Email" type="email" name="email" autoComplete="email" required value={form.email} onChange={set('email')} />
            <PasswordField label="Password" name="password" autoComplete="current-password" required value={form.password} onChange={set('password')} />
          </>
        ) : (
          <>
            <p className="text-sm text-muted">{useRecovery ? 'Enter one of your saved recovery codes. Each works once.' : 'Enter the 6-digit code from your authenticator app.'}</p>
            <TextField label={useRecovery ? 'Recovery code' : 'Authenticator code'} name="factor" autoComplete="one-time-code" inputMode={useRecovery ? 'text' : 'numeric'}
              autoFocus required value={factor} onChange={(e) => setFactor(e.target.value)} />
            <button type="button" className="text-sm text-accent underline underline-offset-4" onClick={() => { setUseRecovery((v) => !v); setFactor(''); setError(''); }}>
              {useRecovery ? 'Use authenticator app instead' : 'Use a recovery code instead'}
            </button>
          </>
        )}
        <Button type="submit" loading={busy} className="w-full">{step === 'credentials' ? 'Sign in' : 'Verify and sign in'}</Button>
      </form>
      <p className="mt-6 text-sm text-muted">New to HomeIntel? <Link to="/register" className="text-accent underline underline-offset-4">Create an account</Link></p>
    </AuthLayout>
  );
}
