import React from "react";

const variants = {
  primary:
    "border border-primary/80 bg-action-primary text-content-on-primary shadow-sm shadow-primary/15 hover:border-primary-light hover:bg-action-primary-hover disabled:bg-surface-disabled disabled:text-content-disabled",
  secondary:
    "border border-surface-border/80 bg-surface-elevated/55 text-content-secondary hover:border-primary/35 hover:bg-surface-elevated hover:text-content-primary",
  soft: "border border-primary/40 bg-primary/14 text-primary-light shadow-sm shadow-primary/5 hover:border-primary/60 hover:bg-primary/20",
  selected:
    "border border-primary/45 bg-primary/18 text-content-primary shadow-sm shadow-primary/8 hover:border-primary/60 hover:bg-primary/24",
  danger:
    "border border-action-danger/80 bg-action-danger text-content-on-danger shadow-sm shadow-state-error/10 hover:bg-action-danger-hover disabled:bg-action-danger/60",
  ghost:
    "border border-transparent bg-transparent text-content-secondary hover:border-surface-border hover:bg-surface-elevated/70 hover:text-content-primary",
};

const sizes = {
  sm: "min-h-8 px-3 py-1.5 text-sm",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-11 px-5 py-2.5 text-base",
};

export default function Button({
  as: Component = "button",
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...props
}) {
  const typeProps =
    Component === "button" ? { type: props.type || "button" } : {};

  return (
    <Component
      {...typeProps}
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg",
        "disabled:cursor-not-allowed disabled:opacity-70",
        variants[variant] || variants.secondary,
        sizes[size] || sizes.md,
        className,
      ].join(" ")}
    >
      {children}
    </Component>
  );
}
