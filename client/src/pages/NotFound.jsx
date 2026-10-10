import { Link } from 'react-router';
import SearchBox from '../components/SearchBox.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <section aria-labelledby="nf" className="max-w-2xl py-10">
      <p className="num text-2xl text-muted">404</p>
      <h1 id="nf" className="mt-2 text-5xl">This address isn’t on the map.</h1>
      <p className="mt-4 text-muted">The page you asked for doesn’t exist, or a neighborhood link is out of date. Search for the locality instead.</p>
      <div className="mt-6 max-w-lg"><SearchBox /></div>
      <Link to="/" className="mt-6 inline-block text-accent underline underline-offset-4">Back to start</Link>
    </section>
  );
}
