import React from "react";

const variants = {
  primary:
    "border border-primary/80 bg-action-primary text-white shadow-sm shadow-primary/15 hover:border-primary-light hover:bg-action-primary-hover disabled:bg-primary-dark",
  secondary:
    "border border-surface-border bg-surface-elevated/80 text-content-primary hover:border-secondary/50 hover:bg-surface-border",
  danger:
    "border border-action-danger/80 bg-action-danger text-white shadow-sm shadow-state-error/10 hover:bg-action-danger-hover disabled:bg-action-danger/60",
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
  const typeProps = Component === "button" ? { type: props.type || "button" } : {};

  return (
    <Component
      {...typeProps}
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-primary/70 focus:ring-offset-2 focus:ring-offset-surface-bg",
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
