import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Sparkles } from 'lucide-react';
import { useAi, resetAiStatusCache } from '../lib/ai.js';
import { useAuth } from '../lib/auth.jsx';
import { aiApi } from '../lib/endpoints.js';
import { Button } from './ui.jsx';
import AiResult from './AiResult.jsx';
import { useToast } from './Toast.jsx';

/** Optional, on-demand AI explanation placed below deterministic results. Absent AI never blocks anything. */
export default function AiExplain({ kind, neighborhoodIds, weights }) {
  const ai = useAi(); const { user } = useAuth(); const { pathname, search } = useLocation();
  const toast = useToast();
  const [run, setRun] = useState(null); const [busy, setBusy] = useState(false);
  if (!ai.loaded) return null;
  const title = kind === 'comparison' ? 'Explain these differences' : 'Summarise this neighborhood';
  async function go() {
    setBusy(true);
    try { setRun(await aiApi.analyze({ agent: kind, neighborhoodIds, ...(weights ? { weights } : {}) })); resetAiStatusCache(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="ai-x" className="no-print mt-12 rounded-lg border border-line bg-surface p-6">
      <h2 id="ai-x" className="flex items-center gap-2 text-2xl"><Sparkles size={18} className="text-accent" aria-hidden="true" />Research assistant</h2>
      {!ai.available ? <p className="mt-2 text-sm text-muted">The research assistant isn’t configured on this server. Everything above is calculated without it.</p>
        : !user ? <p className="mt-2 text-sm text-muted"><Link to={`/login?next=${encodeURIComponent(pathname + search)}`} className="text-accent underline">Sign in</Link> to ask for a written explanation based on this evidence.</p>
        : run ? <div className="mt-4"><AiResult run={run} /><Button variant="ghost" className="mt-3 h-8 px-3 text-xs" onClick={go} loading={busy}>Ask again</Button></div>
        : (
          <div className="mt-2">
            <p className="max-w-prose text-sm text-muted">Get a plain-language explanation written only from the evidence on this page, with each point linked to the value it relies on.{ai.quota ? ` ${ai.quota.limit - ai.quota.used} of ${ai.quota.limit} requests left today.` : ''}</p>
            <Button className="mt-3" onClick={go} loading={busy}>{busy ? 'Writing…' : title}</Button>
          </div>
        )}
    </section>
  );
}
