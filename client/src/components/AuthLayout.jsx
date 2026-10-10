export default function AuthLayout({ title, intro, children }) {
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_26rem] lg:gap-20">
      <section aria-labelledby="auth-title" className="max-w-md lg:pt-6">
                <h1 id="auth-title" className="text-5xl">{title}</h1>
        <p className="mt-4 text-muted">{intro}</p>
        <ul className="mt-8 space-y-3 border-t border-line pt-6 text-sm text-muted">
          <li><span className="font-medium text-ink">Evidence first.</span> Every metric shows its source, date and geographic level.</li>
          <li><span className="font-medium text-ink">Scores you can audit.</span> Calculated by fixed rules, never by a language model.</li>
          <li><span className="font-medium text-ink">Your account, protected.</span> Sessions use secure cookies and optional two-factor sign-in.</li>
        </ul>
      </section>
      <div className="border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-6">{children}</div>
    </div>
  );
}
