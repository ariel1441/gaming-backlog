import React from "react";

export default function PageSection({
  as: Component = "section",
  title,
  description,
  action,
  children,
  className = "",
  contentClassName = "",
}) {
  return (
    <Component className={["space-y-4", className].join(" ")}>
      {title || description || action ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-lg font-semibold text-content-primary sm:text-xl">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-3xl text-sm leading-6 text-content-muted">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={contentClassName}>{children}</div>
    </Component>
  );
}
