import { NavLink, Outlet } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';

const TABS = [['/admin', 'Overview', true], ['/admin/data', 'Data health'], ['/admin/quality', 'Data quality'], ['/admin/security', 'Security events'], ['/admin/users', 'Users']];

// UI gate only — every /api/admin route is enforced on the server (role + two-factor + MFA-verified session).
export default function AdminLayout() {
  useDocumentTitle('Admin console');
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return (
      <section className="max-w-xl py-10" aria-labelledby="noaccess">
        <p className="num text-2xl text-muted">403</p>
        <h1 id="noaccess" className="mt-2 text-5xl">This area is for administrators</h1>
        <p className="mt-4 text-muted">Your account doesn’t have admin access. Admins are created by the person who runs this HomeIntel server.</p>
      </section>
    );
  }
  return (
    <div>
      <div className="mb-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted"><ShieldCheck size={15} className="text-accent" aria-hidden="true" />Signed in as {user.email}, two-factor verified</p>
          <h1 className="mt-1 text-[2.6rem] leading-none sm:text-5xl">Admin console</h1>
        </div>
      </div>
      <nav aria-label="Admin sections" className="mb-8 overflow-x-auto border-b border-line">
        <ul className="flex gap-1 text-sm">
          {TABS.map(([to, label, end]) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `relative block whitespace-nowrap px-3 py-3 ${isActive ? 'font-medium text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent' : 'text-muted hover:text-ink'}`}>{label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
