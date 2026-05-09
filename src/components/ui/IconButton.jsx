import React from "react";
import { X } from "lucide-react";

const variants = {
  default:
    "border border-surface-border bg-surface-card/90 text-content-primary shadow-sm hover:border-secondary/60 hover:bg-surface-elevated hover:text-secondary-light",
  ghost:
    "border border-transparent bg-transparent text-content-muted hover:border-surface-border hover:bg-surface-elevated/70 hover:text-content-primary",
  danger:
    "border border-surface-border bg-surface-card/90 text-content-primary hover:border-state-error hover:bg-state-error hover:text-white",
};

export default function IconButton({
  icon: Icon = X,
  label,
  title,
  variant = "default",
  size = "md",
  className = "",
  ...props
}) {
  const sizeClass = size === "sm" ? "h-8 w-8" : "h-10 w-10";

  return (
    <button
      type="button"
      aria-label={label || title}
      title={title || label}
      {...props}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-primary/70 focus:ring-offset-2 focus:ring-offset-surface-bg",
        "disabled:cursor-not-allowed disabled:opacity-60",
        sizeClass,
        variants[variant] || variants.default,
        className,
      ].join(" ")}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </button>
  );
}
