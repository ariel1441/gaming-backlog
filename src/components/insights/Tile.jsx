export default function Tile({ label, value }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 flex flex-col gap-1">
      <div className="text-xs uppercase tracking-wide text-content-muted">
        {label}
      </div>
      <div className="text-lg md:text-xl font-semibold text-content-primary">
        {value}
      </div>
    </div>
  );
}
