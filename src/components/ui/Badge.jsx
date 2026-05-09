import React from "react";

const variants = {
  default: "border-surface-border bg-surface-elevated text-content-secondary",
  primary: "border-primary/40 bg-primary/15 text-primary-light",
  success: "border-state-success/40 bg-state-success/15 text-state-success",
  warning: "border-state-warning/40 bg-state-warning/15 text-state-warning",
  danger: "border-state-error/40 bg-state-error/15 text-state-error",
};

export default function Badge({ variant = "default", className = "", children }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
        variants[variant] || variants.default,
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

