import React from "react";

export default function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  meta,
  badge,
  actions,
  breadcrumbs,
  className = "",
}) {
  return (
    <header
      className={["border-b border-surface-border pb-5", className].join(" ")}
    >
      {breadcrumbs ? <div className="mb-3">{breadcrumbs}</div> : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center self-center rounded-2xl border border-surface-border bg-surface-card text-content-muted">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? (
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary-light">
                  {eyebrow}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-content-primary sm:text-3xl">
                  {title}
                </h1>
                {meta ? (
                  <span className="self-end pb-0.5 text-sm font-medium text-content-muted">
                    {meta}
                  </span>
                ) : null}
                {badge}
              </div>
              {description ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-content-muted">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
