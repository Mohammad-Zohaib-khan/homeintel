import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText } from 'lucide-react';
import { reports } from '../lib/endpoints.js';
import { useAi } from '../lib/ai.js';
import Dialog from './Dialog.jsx';
import { Button, TextField } from './ui.jsx';
import { useToast } from './Toast.jsx';

/** Opens a small dialog to name a report and choose whether to include the optional AI narrative. */
export default function CreateReportButton({ neighborhoods, weights, variant = 'secondary', label = 'Create report' }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [includeAi, setIncludeAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const ai = useAi();
  const nav = useNavigate();
  const toast = useToast();
  const def = neighborhoods.length === 1 ? `${neighborhoods[0].name}, ${neighborhoods[0].city}` : neighborhoods.map((n) => n.name).join(' vs ');

  async function create(e) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await reports.create({ neighborhoodIds: neighborhoods.map((n) => n.slug), title: title.trim() || undefined, includeAi, ...(weights ? { weights } : {}) });
      toast.success(r.ai.status === 'failed' ? 'Report created. The AI narrative could not be generated.' : 'Report created');
      setOpen(false); nav(`/report/${r.id}`);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}><FileText size={16} aria-hidden="true" />{label}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Create a report">
        <form onSubmit={create} className="space-y-4">
          <p className="text-sm text-muted">A report is a snapshot of {neighborhoods.length === 1 ? 'this profile' : `these ${neighborhoods.length} neighborhoods`} as of today: scores, strengths, concerns, caveats and sources. It won’t change when data refreshes.</p>
          <TextField label="Title" placeholder={def} value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          <label className={`flex items-start gap-3 text-sm ${ai.available ? '' : 'opacity-60'}`}>
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" checked={includeAi && ai.available} disabled={!ai.available} onChange={(e) => setIncludeAi(e.target.checked)} />
            <span><span className="font-medium">Add a written summary from the research assistant</span>
              <span className="block text-muted">{ai.available ? 'Written only from the report’s own data and clearly marked as AI-generated. Takes up to a minute.' : 'The research assistant is not configured on this server. The report is complete without it.'}</span></span>
          </label>
          <div className="flex gap-2"><Button type="submit" loading={busy}>Create report</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </Dialog>
    </>
  );
}
