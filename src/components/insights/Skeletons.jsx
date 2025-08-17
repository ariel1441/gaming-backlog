function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-lg bg-white/10 ${className}`} />
  );
}

export function KPISkeleton() {
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5"
        >
          <Skeleton className="h-3 w-20 mb-3" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </section>
  );
}

export function ChartSkeleton() {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-64 w-full" />
    </section>
  );
}
