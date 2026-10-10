import PageHeader from '../components/PageHeader.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';

export default function Terms() {
  useDocumentTitle('Terms');
  const items = [
    ['What HomeIntel is', 'An information tool that brings together public and open data about neighborhoods and scores it by published rules. It is not a property valuation, a legal opinion, or financial or investment advice.'],
    ['Accuracy', 'Data comes from third parties and can be incomplete, out of date or wrong. Values are labelled with their coverage (for example city-wide) and origin. Demo data is synthetic. Verify anything important on site and with official records before you decide.'],
    ['The research assistant', 'Optional AI answers are generated from HomeIntel’s stored evidence and can still contain mistakes. They never change scores. Treat them as a starting point, not a conclusion.'],
    ['Your account', 'Keep your password private and turn on two-factor sign-in. Don’t use HomeIntel to collect data about individuals, overload the service, or get around its limits or security.'],
    ['Shared reports', 'When you share a report, anyone with the link can read it. You are responsible for who you share it with, and you can turn the link off at any time.'],
    ['Data licences', 'Map data and amenities © OpenStreetMap contributors, available under the Open Database License. Government datasets are used under the Government Open Data License – India. OpenAQ data is subject to each originating provider’s terms.'],
    ['Changes', 'We may update these terms. Material changes will be shown in the product before they apply.'],
  ];
  return (
    <div className="max-w-3xl">
      <PageHeader title="Terms of use">The short version: HomeIntel helps you research. It doesn’t replace your own checks.</PageHeader>
      <dl className="space-y-6">{items.map(([t, d]) => <div key={t}><dt className="font-display text-2xl font-semibold">{t}</dt><dd className="mt-1.5 leading-relaxed text-muted">{d}</dd></div>)}</dl>
      <p className="mt-10 text-sm text-muted">Last updated October 2026.</p>
    </div>
  );
}
