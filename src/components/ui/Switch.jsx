import React from "react";

export default function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = "",
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-center justify-between gap-4 rounded-control border border-surface-border bg-surface-bg/35 p-3 transition-colors hover:border-primary/30 hover:bg-surface-elevated/35",
        disabled ? "cursor-not-allowed opacity-60" : "",
        className,
      ].join(" ")}
    >
      <span className="min-w-0">
        {label ? (
          <span className="block text-sm font-medium text-content-primary">
            {label}
          </span>
        ) : null}
        {description ? (
          <span className="mt-0.5 block text-xs leading-5 text-content-muted">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onChange?.(event.target.checked)}
        disabled={disabled}
      />
      <span
        className={[
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
          checked
            ? "border-primary/70 bg-primary"
            : "border-surface-border bg-surface-elevated",
        ].join(" ")}
        aria-hidden="true"
      >
        <span
          className={[
            "absolute left-0.5 h-5 w-5 rounded-full bg-content-primary shadow-sm transition-transform",
            checked ? "translate-x-5" : "",
          ].join(" ")}
        />
      </span>
    </label>
  );
}
