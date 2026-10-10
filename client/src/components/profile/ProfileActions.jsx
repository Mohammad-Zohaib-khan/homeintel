import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useResource } from '../../lib/useResource.js';
import { saved } from '../../lib/endpoints.js';
import { Button } from '../ui.jsx';
import { useToast } from '../Toast.jsx';
import CreateReportButton from '../CreateReportButton.jsx';

export default function ProfileActions({ neighborhood }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const toast = useToast();
  const status = useResource((s) => saved.status(neighborhood.slug, s), [neighborhood.slug, user?.id], { enabled: !!user });
  const [busy, setBusy] = useState(false);
  if (!user) return <Link to={`/login?next=${encodeURIComponent(pathname)}`} className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-sunken"><Bookmark size={16} aria-hidden="true" />Sign in to save</Link>;

  const isSaved = !!status.data?.saved;
  async function toggle() {
    setBusy(true);
    try {
      if (isSaved) { await saved.remove(status.data.id); status.setData({ saved: false, id: null }); toast.info(`${neighborhood.name} removed from saved`); }
      else { const r = await saved.save(neighborhood.slug); status.setData({ saved: true, id: r.id }); toast.success(`${neighborhood.name} saved`); }
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <Button variant="secondary" onClick={toggle} loading={busy} disabled={status.loading} aria-pressed={isSaved}>
        {isSaved ? <BookmarkCheck size={16} className="text-accent" aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}{isSaved ? 'Saved' : 'Save'}
      </Button>
      <CreateReportButton neighborhoods={[neighborhood]} />
    </>
  );
}
