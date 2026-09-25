import React from "react";

const tones = {
  default: "text-content-primary",
  muted: "text-content-muted",
  primary: "text-primary",
  integration: "text-integration-steam",
  success: "text-state-success",
  warning: "text-state-warning",
};

export default function MetaPill({ icon: Icon, label, value, tone = "default", roomy = false, className = "" }) {
  if (value == null || value === "") return null;
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-surface-border/70 bg-surface-elevated/55 px-2.5 ${roomy ? "py-1.5" : "py-1"} text-xs font-medium text-content-secondary ${className}`}
      title={label}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-content-muted" aria-hidden="true" /> : null}
      <span className={`truncate ${roomy ? "font-semibold" : ""} ${tones[tone] || tones.default}`}>{value}</span>
    </span>
  );
}
