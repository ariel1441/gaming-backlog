import React from "react";
import { Check } from "lucide-react";

export default function Checkbox({
  checked,
  onChange,
  label,
  description,
  ariaLabel,
  disabled = false,
  className = "",
}) {
  return (
    <label
      className={[
        "group inline-flex cursor-pointer items-start gap-3 text-sm text-content-secondary",
        disabled ? "cursor-not-allowed opacity-60" : "",
        className,
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange?.(event.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
        className="peer sr-only"
      />
      <span
        className={[
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
          checked
            ? "border-primary bg-primary text-content-inverse"
            : "border-surface-border bg-surface-bg/70 text-transparent group-hover:border-primary/45 group-hover:bg-surface-elevated",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
        ].join(" ")}
        aria-hidden="true"
      >
        {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      {label || description ? (
        <span>
          {label ? (
            <span className="block font-medium text-content-primary">
              {label}
            </span>
          ) : null}
          {description ? (
            <span className="mt-0.5 block text-xs leading-5 text-content-muted">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}
