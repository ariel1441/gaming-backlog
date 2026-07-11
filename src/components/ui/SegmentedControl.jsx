import React from "react";

const sizeClasses = {
  sm: {
    root: "rounded-lg p-0",
    item: "min-h-7 px-2.5 py-1 text-xs",
    itemRadius: "rounded-none first:rounded-l-lg last:rounded-r-lg",
  },
  md: {
    root: "rounded-xl p-1",
    item: "min-h-8 px-3 text-sm",
    itemRadius: "rounded-lg",
  },
};

export default function SegmentedControl({
  value,
  onChange,
  options = [],
  size = "md",
  ariaLabel,
  className = "",
  itemClassName = "",
  activeClassName = "bg-action-primary text-content-on-primary shadow-sm shadow-primary/15",
  inactiveClassName =
    "text-content-secondary hover:bg-surface-elevated hover:text-content-primary",
  connected = false,
}) {
  const classes = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[
        "inline-flex w-fit items-center border border-surface-border bg-surface-elevated/70",
        classes.root,
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
            aria-pressed={active}
            title={option.title || option.label}
            className={[
              "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg",
              classes.item,
              classes.itemRadius,
              connected && index > 0 ? "border-l border-surface-border" : "",
              active ? activeClassName : inactiveClassName,
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
