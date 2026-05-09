import React from "react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}) {
  return (
    <div
      className={[
        "flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-surface-border bg-surface-card/45 p-8 text-center shadow-panel",
        className,
      ].join(" ")}
    >
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-surface-border bg-surface-elevated text-content-muted">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      ) : null}
      {title ? (
        <h3 className="text-lg font-semibold text-content-primary">{title}</h3>
      ) : null}
      {description ? (
        <p className="mt-2 max-w-md text-sm text-content-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
