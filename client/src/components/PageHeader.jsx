// Consistent page title block. `kicker` is optional context in plain sentence case (not an all-caps eyebrow).
export default function PageHeader({ title, kicker, children, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {kicker && <p className="mb-2 text-sm text-muted">{kicker}</p>}
        <h1 className="text-[2.6rem] leading-[1.02] sm:text-5xl">{title}</h1>
        {children && <div className="mt-3 text-muted">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
