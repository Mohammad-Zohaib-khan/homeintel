import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import { Skeleton } from './ui.jsx';

// UX guard only — every protected API route enforces authentication/authorization on the server.
export default function ProtectedRoute() {
  const { status } = useAuth();
  const { pathname, search } = useLocation();
  if (status === 'loading') return <div className="space-y-4" aria-busy="true" aria-label="Loading your account"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full max-w-xl" /></div>;
  if (status === 'anon') return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  return <Outlet />;
}
