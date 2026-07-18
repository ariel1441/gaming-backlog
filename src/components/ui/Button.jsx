import React, { forwardRef } from "react";

const variants = {
  primary:
    "border border-primary/80 bg-action-primary text-content-on-primary shadow-sm shadow-primary/15 hover:border-primary-light hover:bg-action-primary-hover disabled:bg-surface-disabled disabled:text-content-disabled",
  secondary:
    "border border-surface-border/80 bg-surface-elevated/55 text-content-secondary hover:border-primary/40 hover:bg-surface-selected/60 hover:text-primary-light",
  soft: "border border-primary/40 bg-surface-selected/70 text-primary-light shadow-sm shadow-primary/5 hover:border-primary/60 hover:bg-surface-selected",
  selected:
    "border border-primary/55 bg-surface-selected text-content-primary shadow-sm shadow-primary/10 ring-1 ring-inset ring-primary/20 hover:border-primary/70 hover:text-primary-light",
  filterActive:
    "border border-primary bg-action-primary text-content-on-primary shadow-sm shadow-primary/20 hover:border-primary-light hover:bg-action-primary-hover",
  danger:
    "border border-action-danger/80 bg-action-danger text-content-on-danger shadow-sm shadow-state-error/10 hover:bg-action-danger-hover disabled:bg-action-danger/60",
  dangerGhost:
    "border border-state-error/25 bg-transparent text-state-error hover:border-state-error/55 hover:bg-state-error/10 hover:text-state-error hover:ring-1 hover:ring-inset hover:ring-state-error/25 active:border-state-error/70 active:ring-2 active:ring-inset active:ring-state-error/25",
  ghost:
    "border border-transparent bg-transparent text-content-secondary hover:border-primary/30 hover:bg-surface-selected/55 hover:text-primary-light",
};

const sizes = {
  sm: "min-h-10 px-3 py-1.5 text-sm",
  md: "min-h-11 px-4 py-2 text-sm",
  lg: "min-h-11 px-5 py-2.5 text-base",
};

const Button = forwardRef(function Button(
  {
    as: Component = "button",
    variant = "secondary",
    size = "md",
    className = "",
    children,
    ...props
  },
  ref,
) {
  const typeProps =
    Component === "button" ? { type: props.type || "button" } : {};

  return (
    <Component
      ref={ref}
      {...typeProps}
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-[background-color,border-color,color,box-shadow,transform]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70",
        "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 disabled:active:translate-y-0",
        "aria-busy:cursor-wait aria-busy:opacity-80",
        variants[variant] || variants.secondary,
        sizes[size] || sizes.md,
        className,
      ].join(" ")}
    >
      {children}
    </Component>
  );
});

export default Button;
