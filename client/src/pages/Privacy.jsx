import PageHeader from '../components/PageHeader.jsx';
import { useConsent } from '../lib/consent.jsx';
import { Button } from '../components/ui.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

const H = ({ children, id }) => <h2 id={id} className="mt-10 text-3xl">{children}</h2>;

export default function Privacy() {
  useDocumentTitle('Privacy');
  const { reopen, preferences, decided } = useConsent();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Privacy notice">What HomeIntel stores about you, why, and how to remove it.</PageHeader>
      <div className="space-y-4 text-[1.02rem] leading-relaxed">
        <H>What we store</H>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Account:</strong> your name, email, a one-way hash of your password (Argon2id), and if you enable two-factor sign-in, an encrypted authenticator secret and hashed recovery codes.</li>
          <li><strong>What you create:</strong> saved neighborhoods with your notes and tags, saved comparisons, reports, your priority weights and research-assistant requests with their answers.</li>
          <li><strong>Security records:</strong> sign-in events with a shortened network address (the last part removed) and browser type, kept to detect misuse.</li>
        </ul>
        <p>We do not store payment details, precise location, or browsing history. If you upload a shortlist CSV, it is read once in memory and not kept.</p>
        <H>Cookies and browser storage</H>
        <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-muted"><th className="py-2 font-normal">Name</th><th className="py-2 font-normal">Purpose</th><th className="py-2 font-normal">Kind</th></tr></thead>
          <tbody>
            {[['hi_at', 'Keeps you signed in (15 minutes, renewed automatically)', 'Necessary cookie, HttpOnly'], ['hi_rt', 'Renews your session (7 days)', 'Necessary cookie, HttpOnly'], ['hi_mfa', 'Holds a sign-in in progress while you enter a two-factor code (5 minutes)', 'Necessary cookie, HttpOnly'], ['hi_csrf', 'Protects forms against cross-site request forgery', 'Necessary cookie, HttpOnly'], ['hi-consent', 'Remembers your storage choice', 'Necessary, browser storage'], ['hi-theme, hi-compare', 'Your theme and compare tray', 'Preferences, only with your consent']].map((r) => <tr key={r[0]} className="border-b border-line align-top">{r.map((c, i) => <td key={i} className={`py-2 pr-3 ${i ? '' : 'font-mono text-xs'}`}>{c}</td>)}</tr>)}
          </tbody>
        </table>
        <p>There are no analytics, advertising or social-media trackers. Map tiles load from OpenStreetMap’s servers, which receive your IP address as part of any web request.</p>
        <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={reopen}>Change storage preferences</Button><span className="text-sm text-muted">Current choice: {decided ? (preferences ? 'necessary and preferences' : 'necessary only') : 'not set yet'}.</span></div>
        <H>Research assistant</H>
        <p>If the server operator has configured an AI provider, your request text and the neighborhood evidence it uses are sent to that provider to generate an answer. Your name and email are never sent. If no provider is configured, nothing leaves HomeIntel.</p>
        <H>Your choices</H>
        <p>You can edit or delete anything you saved at any time. You can export saved neighborhoods as CSV. Deleting your account (Account, then Delete account) removes your profile, saved items, comparisons, reports and research requests immediately, and turns off any shared report links. Security records are kept without the link to you.</p>
        <H>Security</H>
        <p>Sessions use HttpOnly, SameSite cookies; tokens are never readable by page scripts. Passwords are hashed with Argon2id. Two-factor sign-in is available. Every request for your saved items is checked against your account on the server.</p>
        <p className="text-sm text-muted">Last updated October 2026.</p>
      </div>
    </div>
  );
}
