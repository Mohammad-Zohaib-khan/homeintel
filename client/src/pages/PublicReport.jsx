import { Link, useParams } from 'react-router';
import ReportBody from '../components/ReportBody.jsx';
import { ErrorState, Skeleton } from '../components/States.jsx';
import { reports } from '../lib/endpoints.js';
import { useResource } from '../lib/useResource.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { fmtDate } from '../lib/format.js';

export default function PublicReport() {
  const { token } = useParams();
  const rep = useResource((s) => reports.shared(token, s), [token]);
  useDocumentTitle(rep.data?.title ?? 'Shared report');
  if (rep.error?.status === 404 || rep.error?.status === 400) {
    return <section className="max-w-xl py-10"><h1 className="text-5xl">This shared report isn’t available</h1><p className="mt-4 text-muted">The owner may have turned sharing off or deleted it. Ask them for a new link.</p><Link to="/" className="mt-6 inline-block text-accent underline underline-offset-4">Go to HomeIntel</Link></section>;
  }
  if (rep.error) return <ErrorState error={rep.error} onRetry={rep.reload} title="This report could not load" />;
  if (!rep.data) return <div aria-busy="true" aria-label="Loading report" className="space-y-4"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  return (
    <article aria-labelledby="pub-title">
      <header className="mb-10 border-b border-line pb-6">
        <p className="text-sm text-muted">Shared {rep.data.kind === 'comparison' ? 'comparison' : 'neighborhood'} report, created {fmtDate(rep.data.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}. Read-only.</p>
        <h1 id="pub-title" className="mt-1 text-5xl">{rep.data.title}</h1>
      </header>
      <ReportBody report={rep.data} />
      <p className="no-print mt-12 border-t border-line pt-6 text-sm text-muted">Made with HomeIntel. <Link to="/explore" className="text-accent underline underline-offset-4">Explore these neighborhoods yourself</Link></p>
    </article>
  );
}
