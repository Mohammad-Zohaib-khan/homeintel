import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert, Button, fieldErrors, PasswordField, TextField } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Register() {
  useDocumentTitle('Create account');
  const { register, user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user && !busy) return <Navigate to="/account" replace />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault(); setError(''); setErrors({}); setBusy(true);
    try {
      await register(form);
      toast.success('Account created. Consider turning on two-factor sign-in.');
      nav('/account', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.code === 'VALIDATION_ERROR' ? 'Please fix the highlighted fields.' : err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your account." intro="Save neighborhoods, keep comparisons, and generate reports you can come back to.">
      <form onSubmit={submit} noValidate className="space-y-5" aria-label="Create account">
        {error && <Alert>{error}</Alert>}
        <TextField label="Name" name="name" autoComplete="name" required value={form.name} onChange={set('name')} error={errors.name} />
        <TextField label="Email" type="email" name="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
        <PasswordField label="Password" name="password" autoComplete="new-password" required value={form.password} onChange={set('password')}
          hint="At least 12 characters. A passphrase of several words works well." error={errors.password} />
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
      <p className="mt-6 text-sm text-muted">Already registered? <Link to="/login" className="text-accent underline underline-offset-4">Sign in</Link></p>
    </AuthLayout>
  );
}
