import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export default function RouteError() {
  const err = useRouteError();
  const status = isRouteErrorResponse(err) ? err.status : 500;
  return (
    <div className="mx-auto max-w-xl px-6 py-24" role="alert">
      <p className="num text-2xl text-muted">Error {status}</p>
      <h1 className="mt-3 text-3xl font-semibold">This page failed to load.</h1>
      <p className="mt-3 text-muted">A script may have failed to download or something unexpected happened. Reloading usually resolves it.</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink">Reload</button>
        <Link to="/" className="rounded-md border border-line px-4 py-2 text-sm">Go to start</Link>
      </div>
    </div>
  );
}
