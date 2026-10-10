import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export default function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 900);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  if (!show) return null;
  return (
    <button type="button" onClick={() => { window.scrollTo({ top: 0 }); document.getElementById('main')?.focus({ preventScroll: true }); }}
      className="no-print fixed bottom-5 right-5 z-40 grid h-10 w-10 place-items-center rounded-md border border-line bg-raised text-muted shadow-raise hover:text-ink" aria-label="Back to top">
      <ArrowUp size={18} aria-hidden="true" />
    </button>
  );
}
