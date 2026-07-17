import React from "react";

const sizeClasses = {
  sm: {
    root: "p-0.5",
    item: "min-h-8 px-2.5 py-1 text-xs",
  },
  md: {
    root: "p-1",
    item: "min-h-8 px-3 text-sm",
  },
};

const variants = {
  view: {
    root: "rounded-control",
    item: "rounded-lg",
    active:
      "bg-surface-selected text-primary-light shadow-sm shadow-primary/10 ring-1 ring-inset ring-primary/50",
    inactive:
      "text-content-muted hover:bg-surface-selected/60 hover:text-primary-light",
  },
  connected: {
    root: "overflow-hidden rounded-control p-0",
    item: "rounded-none first:rounded-l-control last:rounded-r-control",
    active:
      "bg-action-primary text-content-on-primary shadow-sm shadow-primary/15",
    inactive:
      "text-content-secondary hover:bg-surface-selected/60 hover:text-primary-light",
  },
};

export default function SegmentedControl({
  value,
  onChange,
  options = [],
  size = "md",
  ariaLabel,
  variant = "view",
  disabled = false,
  className = "",
  itemClassName = "",
  connected = false,
}) {
  const classes = sizeClasses[size] || sizeClasses.md;
  const recipe = variants[connected ? "connected" : variant] || variants.view;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[
        "inline-flex w-fit items-center border border-surface-border bg-surface-elevated/70",
        classes.root,
        recipe.root,
        className,
      ].join(" ")}
    >
      {options.map((option, index) => {
        const active = value === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled || option.disabled}
            aria-pressed={active}
            title={option.title || option.label}
            className={[
              "inline-flex items-center justify-center gap-2 font-medium transition-[background-color,color,box-shadow,transform] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0",
              classes.item,
              recipe.item,
              (connected || variant === "connected") && index > 0
                ? "border-l border-surface-border"
                : "",
              active ? recipe.active : recipe.inactive,
              itemClassName,
            ].join(" ")}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            {option.renderLabel ? option.renderLabel(option) : option.label}
          </button>
        );
      })}
    </div>
  );
}
