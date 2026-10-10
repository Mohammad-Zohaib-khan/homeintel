import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, unwrap } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Button, fieldErrors, PasswordField, TextField } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import MfaPanel from '../components/MfaPanel.jsx';

const Section = ({ id, title, children }) => (
  <section aria-labelledby={id} className="grid gap-4 border-t border-line py-8 md:grid-cols-[14rem_1fr] md:gap-10">
    <h2 id={id} className="text-2xl">{title}</h2>
    <div>{children}</div>
  </section>
);

function ChangePassword() {
  const { user, reload } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', code: '' });
  const [errors, setErrors] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setErrors({});
    try {
      await unwrap(api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword, ...(user.mfaEnabled ? { code: f.code } : {}) }));
      setF({ currentPassword: '', newPassword: '', code: '' }); toast.success('Password updated. Other devices were signed out.'); await reload();
    } catch (err) { setErrors(fieldErrors(err)); setError(err.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} noValidate className="max-w-sm space-y-4" aria-label="Change password">
      {error && <Alert>{error}</Alert>}
      <PasswordField label="Current password" autoComplete="current-password" required value={f.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} />
      <PasswordField label="New password" autoComplete="new-password" required value={f.newPassword} onChange={set('newPassword')} hint="At least 12 characters." error={errors.newPassword} />
      {user.mfaEnabled && <TextField label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" required value={f.code} onChange={set('code')} error={errors.code} />}
      <Button type="submit" loading={busy}>Update password</Button>
    </form>
  );
}

function DeleteAccount() {
  const { user, reload } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ password: '', code: '', confirm: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await unwrap(api.post('/auth/delete-account', { password: f.password, confirm: f.confirm, ...(user.mfaEnabled ? { code: f.code } : {}) }));
      toast.info('Your account and everything in it has been deleted.');
      await reload().catch(() => {}); nav('/', { replace: true }); window.location.reload();
    } catch (err) { setError(err.code === 'VALIDATION_ERROR' ? 'Type DELETE to confirm.' : err.message); setBusy(false); }
  }
  return (
    <form onSubmit={submit} noValidate className="max-w-sm space-y-4" aria-label="Delete account">
      <p className="text-sm text-muted">Permanently removes your account, saved neighborhoods, comparisons, reports (and their shared links) and research requests. This can’t be undone.</p>
      {error && <Alert>{error}</Alert>}
      <PasswordField label="Password" autoComplete="current-password" required value={f.password} onChange={set('password')} />
      {user.mfaEnabled && <TextField label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" required value={f.code} onChange={set('code')} />}
      <TextField label="Type DELETE to confirm" required value={f.confirm} onChange={set('confirm')} autoComplete="off" />
      <Button type="submit" variant="danger" loading={busy} disabled={f.confirm !== 'DELETE'}>Delete my account</Button>
    </form>
  );
}

export default function Account() {
  useDocumentTitle('Account');
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const signOut = async () => { try { await logout(); } catch { /* local state is cleared regardless */ } toast.info('You have been signed out.'); nav('/', { replace: true }); };
  return (
    <div>
      <p className="text-muted">Your account</p>
      <h1 className="mt-1 text-5xl">{user.name}</h1>
      <p className="mt-1 text-muted">{user.email}</p>
      <div className="mt-10">
        <Section id="sec-2fa" title="Two-factor sign-in"><MfaPanel /></Section>
        <Section id="sec-pw" title="Password"><ChangePassword /></Section>
        <Section id="sec-delete" title="Delete account"><DeleteAccount /></Section>
        <Section id="sec-session" title="Session">
          <p className="mb-4 max-w-md text-sm text-muted">Signing out ends this session on this device.</p>
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </Section>
      </div>
    </div>
  );
}
