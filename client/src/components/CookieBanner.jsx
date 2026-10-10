import { useState } from 'react';
import { Link } from 'react-router';
import { useConsent } from '../lib/consent.jsx';
import { Button } from './ui.jsx';

export default function CookieBanner() {
  const { decided, decide } = useConsent();
  const [prefs, setPrefs] = useState(true);
  if (decided) return null;
  return (
    <section aria-label="Storage preferences" className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-lg border border-line bg-raised p-5 shadow-raise sm:inset-x-6">
      <h2 className="text-lg">How HomeIntel uses your browser storage</h2>
      <p className="mt-1.5 text-sm text-muted">Sign-in and security cookies are always on because the site cannot work without them. There are no analytics or advertising trackers. <Link to="/privacy" className="text-accent underline underline-offset-4">Privacy notice</Link></p>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={prefs} onChange={(e) => setPrefs(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" />
        <span><span className="font-medium">Remember preferences on this device</span><span className="block text-muted">Your theme and the neighborhoods in your compare tray.</span></span>
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => decide(prefs)}>Save choices</Button>
        <Button variant="secondary" onClick={() => decide(false)}>Necessary only</Button>
      </div>
    </section>
  );
}
