import React from "react";

const variants = {
  summary: {
    root: "rounded-card border border-surface-border bg-surface-elevated/45 p-3",
    label: "flex items-center gap-2 text-xs text-content-muted",
    icon: "h-4 w-4 shrink-0",
    value: "mt-2 break-words text-lg font-semibold text-content-primary sm:text-xl",
  },
  profile: {
    root: "rounded-xl border border-surface-border bg-surface-bg/35 p-3",
    label: "flex items-center gap-2 text-xs uppercase tracking-wide text-content-muted",
    icon: "h-4 w-4 shrink-0",
    value: "mt-2 truncate text-xl font-semibold text-content-primary",
  },
  compact: {
    root: "rounded-xl border border-surface-border bg-surface-bg/35 p-3",
    label: "text-xs uppercase tracking-wide text-content-muted",
    icon: "h-4 w-4 shrink-0",
    value: "mt-1 truncate text-sm font-semibold text-content-primary",
  },
};

export default function MetricCard({ icon: Icon, label, value, variant = "summary", className = "" }) {
  const recipe = variants[variant] || variants.summary;
  return (
    <div className={`min-w-0 ${recipe.root} ${className}`}>
      <div className={recipe.label}>
        {Icon ? <Icon className={recipe.icon} aria-hidden="true" /> : null}
        <span>{label}</span>
      </div>
      <div className={recipe.value}>{value}</div>
    </div>
  );
}
