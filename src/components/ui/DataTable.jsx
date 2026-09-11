import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export function DataTableFrame({ children, className = "", ...props }) {
  return (
    <div
      {...props}
      className={[
        "overflow-auto rounded-2xl border border-surface-border bg-surface-card shadow-panel",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function DataTableSortButton({
  label,
  sortKey,
  activeSortKey,
  isReversed = false,
  onSort,
  className = "",
}) {
  const active = activeSortKey === sortKey;
  const Icon = active ? (isReversed ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort?.(sortKey)}
      className={[
        "group/sort inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-lg px-1.5 text-left text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70",
        active
          ? "text-primary-light"
          : "text-content-muted hover:text-content-primary",
        className,
      ].join(" ")}
      aria-label={`${label}, ${
        active
          ? `sorted ${isReversed ? "descending" : "ascending"}`
          : "not sorted"
      }. Activate to ${
        active
          ? `sort ${isReversed ? "ascending" : "descending"}`
          : "sort ascending"
      }.`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <Icon
        className={[
          "h-3.5 w-3.5 shrink-0",
          active
            ? "text-primary-light"
            : "text-content-muted/65 group-hover/sort:text-content-secondary",
        ].join(" ")}
        aria-hidden="true"
      />
    </button>
  );
}
