import { useEffect, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { api, unwrap } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Button, CopyButton, Skeleton, TextField, PasswordField } from './ui.jsx';
import { useToast } from './Toast.jsx';

function RecoveryCodes({ codes, onDone }) {
  const text = `HomeIntel recovery codes\nEach code works once. Store them somewhere safe.\n\n${codes.join('\n')}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'homeintel-recovery-codes.txt' });
    a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-4">
      <Alert tone="success">Two-factor sign-in is on. Save these recovery codes now — they will not be shown again.</Alert>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-line bg-sunken p-4 font-mono text-sm tracking-wide" aria-label="Recovery codes">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={codes.join('\n')} label="Copy codes" />
        <Button variant="secondary" onClick={download} className="h-8 px-3 text-xs"><Download size={14} aria-hidden="true" />Download</Button>
        <Button onClick={onDone} className="h-8 px-3 text-xs">I have saved them</Button>
      </div>
    </div>
  );
}

export default function MfaPanel() {
  const { reload, user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [codes, setCodes] = useState(null);
  const [code, setCode] = useState('');
  const [dis, setDis] = useState({ password: '', code: '' });
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => unwrap(api.get('/auth/mfa/status')).then(setStatus).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.code === 'VALIDATION_ERROR' ? (e.details?.[0]?.message ?? 'Check the code and try again.') : e.message); } finally { setBusy(false); } };
  const begin = () => run(async () => setSetup(await unwrap(api.post('/auth/mfa/setup', {}))));
  const enable = (e) => { e.preventDefault(); run(async () => {
    const d = await unwrap(api.post('/auth/mfa/enable', { code: code.replace(/\D/g, '') })); setCodes(d.recoveryCodes); setSetup(null); setCode(''); await reload(); await load();
  }); };
  const disable = (e) => { e.preventDefault(); run(async () => {
    await unwrap(api.post('/auth/mfa/disable', { password: dis.password, code: dis.code.replace(/\D/g, '') })); setShowDisable(false); setDis({ password: '', code: '' });
    toast.success('Two-factor sign-in turned off'); await reload(); await load();
  }); };

  if (!status && !error) return <Skeleton className="h-24 w-full" />;
  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {codes ? <RecoveryCodes codes={codes} onDone={() => setCodes(null)} /> : status?.enabled ? (
        <>
          <p className="flex items-center gap-2 text-sm"><ShieldCheck size={17} className="text-good" aria-hidden="true" /><span className="font-medium">Enabled</span>
            <span className="text-muted">· {status.recoveryCodesRemaining} recovery codes left</span></p>
          {showDisable ? (
            <form onSubmit={disable} className="max-w-sm space-y-4" aria-label="Turn off two-factor sign-in">
              <PasswordField label="Password" autoComplete="current-password" required value={dis.password} onChange={(e) => setDis({ ...dis, password: e.target.value })} />
              <TextField label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" required value={dis.code} onChange={(e) => setDis({ ...dis, code: e.target.value })} />
              <div className="flex gap-2"><Button type="submit" variant="danger" loading={busy}>Turn off</Button><Button variant="ghost" onClick={() => setShowDisable(false)}>Cancel</Button></div>
            </form>
          ) : user?.role === 'admin'
            ? <p className="max-w-md text-sm text-muted">Admins must keep two-factor sign-in on. Another admin has to remove your admin role before you can turn it off.</p>
            : <Button variant="secondary" onClick={() => setShowDisable(true)}>Turn off two-factor</Button>}
        </>
      ) : setup ? (
        <form onSubmit={enable} className="space-y-4" aria-label="Confirm two-factor setup">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Scan this QR code with an authenticator app (1Password, Authy, Google Authenticator, …).</li>
            <li>Enter the 6-digit code it shows to confirm.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-6">
            <img src={setup.qrDataUrl} alt="QR code for your authenticator app" width="176" height="176" className="rounded-md border border-line bg-white p-1" />
            <div className="min-w-0 text-sm"><p className="text-muted">Can’t scan? Enter this key manually:</p>
              <p className="mt-1 break-all font-mono text-xs">{setup.secret}</p><div className="mt-2"><CopyButton value={setup.secret} label="Copy key" /></div></div>
          </div>
          <div className="max-w-xs"><TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} /></div>
          <div className="flex gap-2"><Button type="submit" loading={busy}>Confirm and turn on</Button><Button variant="ghost" onClick={() => setSetup(null)}>Cancel</Button></div>
        </form>
      ) : (
        <>
          <p className="max-w-lg text-sm text-muted">Add a second step at sign-in using an authenticator app. Recommended — it protects your saved data even if your password leaks.</p>
          <Button onClick={begin} loading={busy}>Set up two-factor sign-in</Button>
        </>
      )}
    </div>
  );
}
