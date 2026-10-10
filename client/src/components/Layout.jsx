import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigation } from 'react-router';
import { Keyboard, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useTheme } from '../lib/theme.jsx';
import { useAuth } from '../lib/auth.jsx';
import SearchBox from './SearchBox.jsx';
import BackToTop from './BackToTop.jsx';
import CookieBanner from './CookieBanner.jsx';
import CompareTray from './CompareTray.jsx';
import { ShortcutHelp, useShortcuts } from './Shortcuts.jsx';
import { useConsent } from '../lib/consent.jsx';

export function Wordmark({ className = '' }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`} aria-label="HomeIntel home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="5" fill="rgb(var(--ink))" />
        <path d="M6 22c4-1 5-6 10-6s6 5 10 6" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.6" />
        <path d="M9 17c3-.8 4-4.5 7-4.5s4 3.7 7 4.5" fill="none" stroke="rgb(var(--surface))" strokeWidth="1.4" opacity=".75" />
        <circle cx="16" cy="9.5" r="2" fill="rgb(var(--surface))" />
      </svg>
      <span className="font-display text-[1.35rem] font-semibold tracking-tight">HomeIntel</span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button type="button" onClick={toggle} aria-pressed={dark} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="grid h-9 w-9 place-items-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-ink">
      {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}

const PUBLIC_LINKS = [['/explore', 'Explore'], ['/compare', 'Compare'], ['/personalize', 'Priorities']];
const PRIVATE_LINKS = [['/saved', 'Saved'], ['/reports', 'Reports'], ['/ai', 'Research']];
const navCls = ({ isActive }) => `relative rounded-md px-2.5 py-2 text-[0.94rem] ${isActive ? 'font-medium text-ink after:absolute after:inset-x-2.5 after:-bottom-[9px] after:h-0.5 after:bg-accent' : 'text-muted hover:text-ink'}`;

function AccountArea({ mobile, onNavigate }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <span className="h-5 w-20 animate-pulse rounded-sm bg-sunken motion-reduce:animate-none" aria-hidden="true" />;
  if (user) {
    return (
      <NavLink to="/account" onClick={onNavigate} title="Account" className={({ isActive }) => `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`}>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft font-display text-sm font-semibold text-accent" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
        <span className={mobile ? '' : 'sr-only'}>Account</span>
      </NavLink>
    );
  }
  return (
    <div className={`flex items-center gap-1 ${mobile ? 'flex-col items-stretch' : ''}`}>
      <NavLink to="/login" onClick={onNavigate} className={navCls}>Sign in</NavLink>
      <Link to="/register" onClick={onNavigate} className="rounded-md bg-ink px-3.5 py-2 text-center text-sm font-medium text-surface hover:opacity-90">Create account</Link>
    </div>
  );
}

function Footer() {
  const { reopen } = useConsent();
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-sm text-muted">Neighborhood evidence for people deciding where to live. Scores come from fixed, published rules, and every value shows its source.</p>
        </div>
        <nav aria-label="Product" className="flex flex-col gap-2">
          <Link to="/explore" className="text-muted hover:text-ink">Explore localities</Link>
          <Link to="/compare" className="text-muted hover:text-ink">Compare</Link>
          <Link to="/about#method" className="text-muted hover:text-ink">How scores work</Link>
          <Link to="/about#sources" className="text-muted hover:text-ink">Data sources</Link>
        </nav>
        <nav aria-label="Legal" className="flex flex-col gap-2">
          <Link to="/about" className="text-muted hover:text-ink">About</Link>
          <Link to="/privacy" className="text-muted hover:text-ink">Privacy</Link>
          <Link to="/terms" className="text-muted hover:text-ink">Terms</Link>
          <button type="button" onClick={reopen} className="text-left text-muted hover:text-ink">Storage preferences</button>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-faint sm:px-6">Map data and amenities © OpenStreetMap contributors (ODbL). Air quality from OpenAQ and CPCB; crime statistics from NCRB via data.gov.in when configured.</p>
    </footer>
  );
}

// Announces the new page to screen readers and moves focus to the content on client-side navigation.
function RouteAnnouncer() {
  const { pathname, hash } = useLocation();
  const [msg, setMsg] = useState('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const t = setTimeout(() => {
      setMsg(document.title.replace(/ \| HomeIntel$/, ''));
      if (!hash) document.getElementById('main')?.focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(t);
  }, [pathname, hash]);
  return <p className="sr-only" aria-live="polite" aria-atomic="true">{msg}</p>;
}

export default function Layout() {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { toggle } = useTheme();
  const { help, setHelp } = useShortcuts({ onToggleTheme: toggle });
  const toggleRef = useRef(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const links = user ? [...PUBLIC_LINKS, ...PRIVATE_LINKS, ...(user.role === 'admin' ? [['/admin', 'Admin']] : [])] : PUBLIC_LINKS;
  const headerSearch = !['/', '/explore'].includes(pathname);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      {navigation.state === 'loading' && <div className="nav-progress" role="progressbar" aria-label="Loading page" />}
      <ScrollRestoration />
      <RouteAnnouncer />
      <header className="no-print sticky top-0 z-40 border-b border-line bg-ground/92 backdrop-blur-[6px]">
        <div className="mx-auto flex h-[60px] max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Wordmark />
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-0.5 md:flex">
            {links.map(([to, label]) => <NavLink key={to} to={to} className={navCls}>{label}</NavLink>)}
          </nav>
          <div className="ml-auto hidden w-56 lg:block">{headerSearch && <SearchBox />}</div>
          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            {headerSearch && <Link to="/explore" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink lg:hidden" aria-label="Search localities"><Search size={17} aria-hidden="true" /></Link>}
            <button type="button" onClick={() => setHelp(true)} className="hidden h-9 w-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink md:grid" aria-label="Keyboard shortcuts"><Keyboard size={17} aria-hidden="true" /></button>
            <ThemeToggle />
            <div className="hidden md:block"><AccountArea /></div>
            <button ref={toggleRef} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}
              className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink md:hidden">
              {open ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Primary mobile" className="border-t border-line bg-ground px-4 pb-5 pt-3 md:hidden">
            <ul className="flex flex-col">
              {links.map(([to, label]) => (
                <li key={to}><NavLink to={to} className={({ isActive }) => `block border-b border-line py-3 font-display text-xl ${isActive ? 'text-accent' : ''}`}>{label}</NavLink></li>
              ))}
            </ul>
            <div className="mt-4"><AccountArea mobile onNavigate={() => setOpen(false)} /></div>
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1} className="mx-auto min-h-[70vh] max-w-6xl px-4 pt-8 outline-none sm:px-6 sm:pt-10"><Outlet /></main>
      <Footer />
      <CompareTray />
      <BackToTop />
      <CookieBanner />
      <ShortcutHelp open={help} onClose={() => setHelp(false)} />
    </>
  );
}
