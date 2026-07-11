import React from "react";
import { X } from "lucide-react";

const variants = {
  primary:
    "border border-action-primary bg-action-primary text-content-on-primary shadow-control hover:border-action-primary-hover hover:bg-action-primary-hover",
  default:
    "border border-surface-border bg-surface-card/90 text-content-primary shadow-sm hover:border-secondary/60 hover:bg-surface-elevated hover:text-secondary-light",
  ghost:
    "border border-transparent bg-transparent text-content-muted hover:border-surface-border hover:bg-surface-elevated/70 hover:text-content-primary",
  danger:
    "border border-surface-border bg-surface-card/90 text-content-primary hover:border-action-danger hover:bg-action-danger hover:text-content-on-danger",
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg",
        "disabled:cursor-not-allowed disabled:opacity-60",
        sizeClass,
        variants[variant] || variants.default,
        className,
      ].join(" ")}
    >
      <Icon
        className={size === "sm" ? "h-4 w-4" : "h-5 w-5"}
        aria-hidden="true"
      />
    </button>
  );
}
