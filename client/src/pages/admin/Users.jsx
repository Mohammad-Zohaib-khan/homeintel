import { useEffect, useState } from 'react';
import { LockOpen, LogOut, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import { useResource } from '../../lib/useResource.js';
import { adminApi } from '../../lib/endpoints.js';
import { useAuth } from '../../lib/auth.jsx';
import { EmptyState, ListSkeleton } from '../../components/States.jsx';
import { Button, Alert } from '../../components/ui.jsx';
import Dialog from '../../components/Dialog.jsx';
import { useToast } from '../../components/Toast.jsx';
import { AdminError, Pager, Segmented, Status, useDebounced, when } from './shared.jsx';

const CONFIRM = {
  signOut: (u) => ({ title: `Sign ${u.email} out everywhere?`, body: 'Every session on every device ends now. They can sign in again straight away.', cta: 'Sign out everywhere', run: () => adminApi.signOut(u.id), done: 'Signed out everywhere' }),
  makeAdmin: (u) => ({ title: `Make ${u.email} an admin?`, body: 'They get full access to this console. Their sessions end, and they must sign in again with their authenticator code.', cta: 'Make admin', run: () => adminApi.setRole(u.id, 'admin'), done: 'Now an admin' }),
  removeAdmin: (u) => ({ title: `Remove admin access from ${u.email}?`, body: 'They keep their account and data but lose this console. Their sessions end.', cta: 'Remove admin access', run: () => adminApi.setRole(u.id, 'user'), done: 'Admin access removed', danger: true }),
};

export default function AdminUsers() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState(''); const [role, setRole] = useState(''); const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, role]);
  const list = useResource((s) => adminApi.users({ q: dq || undefined, role: role || undefined, page, limit: 25 }, s), [dq, role, page]);
  const rows = list.data?.data ?? [];
  const replace = (u) => list.setData((d) => ({ ...d, data: d.data.map((x) => (x.id === u.id ? { ...x, ...u, counts: x.counts } : x)) }));

  async function unlock(u) { try { replace(await adminApi.unlock(u.id)); toast.success(`${u.email} unlocked`); } catch (e) { toast.error(e.message); } }
  async function run() {
    setBusy(true); setErr('');
    try { replace(await confirm.run()); toast.success(confirm.done); setConfirm(null); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="u-h">
      <h2 id="u-h" className="text-3xl">Users</h2>
      <p className="mb-5 max-w-2xl text-sm text-muted">Account status and controls. You see how many items each person has, never what they saved, wrote or asked.</p>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-raised px-3 sm:w-80">
          <Search size={15} className="text-muted" aria-hidden="true" /><span className="sr-only">Search by email</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email starts with…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
        </label>
        <Segmented label="Role" value={role} onChange={setRole} options={[['', 'Everyone'], ['admin', 'Admins'], ['user', 'Users']]} />
      </div>
      {list.error ? <AdminError error={list.error} onRetry={list.reload} />
        : !list.data ? <ListSkeleton rows={6} label="Loading users" />
        : !rows.length ? <EmptyState level={3} title="No accounts match">Search matches the start of an email address.</EmptyState>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">Accounts</caption>
              <thead><tr className="border-b border-line-strong text-left text-xs text-muted"><th className="py-2 pr-3 font-normal whitespace-nowrap">Account</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Role</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Two-factor</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Status</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Last sign-in</th><th className="py-2 pr-3 text-right font-normal whitespace-nowrap">Saved, reports, research</th><th className="py-2 font-normal whitespace-nowrap"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id} className="border-b border-line align-top">
                      <td className="py-2.5 pr-3"><span className="font-medium">{u.email}</span><span className="block text-xs text-muted">{u.name}{self ? ' (you)' : ''}, joined {when(u.createdAt).split(',')[0]}</span></td>
                      <td className="py-2.5 pr-3">{u.role === 'admin' ? <span className="inline-flex items-center gap-1 font-medium text-accent"><ShieldCheck size={14} aria-hidden="true" />Admin</span> : 'User'}</td>
                      <td className="py-2.5 pr-3">{u.mfaEnabled ? <Status value="success" label="On" /> : <Status value="idle" label="Off" />}</td>
                      <td className="py-2.5 pr-3">{u.locked ? <Status value="failed" label={`Locked until ${new Date(u.lockUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`} /> : <span className="text-muted">Active</span>}</td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted">{when(u.lastLoginAt)}</td>
                      <td className="tnum py-2.5 pr-3 text-right text-muted">{u.counts.saved}, {u.counts.reports}, {u.counts.aiRuns}</td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {u.locked && <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => unlock(u)}><LockOpen size={14} aria-hidden="true" />Unlock</Button>}
                          {!self && <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setErr(''); setConfirm(CONFIRM.signOut(u)); }} aria-label={`Sign ${u.email} out everywhere`}><LogOut size={14} aria-hidden="true" />Sign out</Button>}
                          {!self && (u.role === 'admin'
                            ? <Button variant="ghost" className="h-8 px-2 text-xs text-bad" onClick={() => { setErr(''); setConfirm(CONFIRM.removeAdmin(u)); }} aria-label={`Remove admin access from ${u.email}`}><ShieldOff size={14} aria-hidden="true" />Remove admin</Button>
                            : <Button variant="ghost" className="h-8 px-2 text-xs" disabled={!u.mfaEnabled} title={u.mfaEnabled ? undefined : 'They must turn on two-factor sign-in first'} onClick={() => { setErr(''); setConfirm(CONFIRM.makeAdmin(u)); }} aria-label={`Make ${u.email} an admin`}><ShieldCheck size={14} aria-hidden="true" />Make admin</Button>)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      <Pager meta={list.data?.meta} onPage={setPage} />
      <p className="mt-4 text-xs text-muted">Only accounts with two-factor sign-in can become admins. You can’t change your own role, and the last admin can’t be removed.</p>
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ''}>
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{confirm.body}</p>
            {err && <Alert>{err}</Alert>}
            <div className="flex gap-2"><Button variant={confirm.danger ? 'danger' : 'primary'} loading={busy} onClick={run}>{confirm.cta}</Button><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button></div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
