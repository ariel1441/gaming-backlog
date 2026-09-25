import React from "react";

export default function MetricPill({ icon: Icon, label, value, className = "" }) {
  return (
    <div className={`inline-flex min-h-11 items-center gap-3 rounded-2xl border border-surface-border bg-surface-card/80 px-4 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-border bg-surface-elevated/70 text-content-secondary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-base font-semibold text-content-primary">{value}</span>
      <span className="text-xs uppercase tracking-[0.18em] text-content-secondary">{label}</span>
    </div>
  );
}
