import { useEffect, useState } from 'react';
import { useResource } from '../../lib/useResource.js';
import { adminApi } from '../../lib/endpoints.js';
import { EmptyState, ListSkeleton } from '../../components/States.jsx';
import { AdminError, ACTION_LABEL, Pager, Segmented, Status, when } from './shared.jsx';

const browser = (ua) => (!ua ? '—' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua === 'homeintel-admin-cli' ? 'Admin CLI' : 'Other');

export default function AdminSecurity() {
  const [group, setGroup] = useState(''); const [outcome, setOutcome] = useState(''); const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [group, outcome]);
  const ev = useResource((s) => adminApi.events({ group: group || undefined, outcome: outcome || undefined, page, limit: 50 }, s), [group, outcome, page]);
  const rows = ev.data?.data ?? [];
  return (
    <section aria-labelledby="sec-h">
      <h2 id="sec-h" className="text-3xl">Security events</h2>
      <p className="mb-5 max-w-2xl text-sm text-muted">The audit log: sign-ins, account changes and every admin action. Network addresses are stored shortened (last part removed), and no passwords, codes or tokens are ever recorded.</p>
      <div className="mb-5 flex flex-wrap gap-4">
        <Segmented label="Kind" value={group} onChange={setGroup} options={[['', 'Everything'], ['auth', 'Sign-in & account'], ['admin', 'Admin actions'], ['data', 'User activity']]} />
        <Segmented label="Outcome" value={outcome} onChange={setOutcome} options={[['', 'Any outcome'], ['failure', 'Failures'], ['success', 'Successes']]} />
      </div>
      {ev.error ? <AdminError error={ev.error} onRetry={ev.reload} />
        : !ev.data ? <ListSkeleton rows={8} label="Loading events" />
        : !rows.length ? <EmptyState level={3} title="No events match">Try a different filter.</EmptyState>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Security events, newest first</caption>
              <thead><tr className="border-b border-line-strong text-left text-xs text-muted"><th className="py-2 pr-3 font-normal whitespace-nowrap">When</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Event</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Outcome</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Account</th><th className="py-2 pr-3 font-normal whitespace-nowrap">Detail</th><th className="py-2 font-normal whitespace-nowrap">From</th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className={`border-b border-line align-top ${e.action === 'auth.refresh_reuse_detected' ? 'bg-bad/5' : ''}`}>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted">{when(e.at)}</td>
                    <td className="py-2 pr-3"><span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span><span className="block text-xs text-faint">{e.action}</span></td>
                    <td className="py-2 pr-3"><Status value={e.outcome === 'failure' ? 'failed' : 'success'} label={e.outcome === 'failure' ? 'Failed' : 'OK'} /></td>
                    <td className="py-2 pr-3">{e.user?.email ?? <span className="text-muted">Unknown or no account</span>}{e.target && <span className="block text-xs text-muted">on {e.target.email}</span>}</td>
                    <td className="max-w-[16rem] py-2 pr-3 text-xs text-muted">{e.detail ?? '—'}</td>
                    <td className="whitespace-nowrap py-2 text-xs text-muted">{e.ipPrefix ?? '—'}<span className="block">{browser(e.userAgent)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <Pager meta={ev.data?.meta} onPage={setPage} />
    </section>
  );
}
