import React from "react";
import { X } from "lucide-react";
import IconButton from "./IconButton";

export default function Panel({
  as: Component = "section",
  innerRef,
  title,
  description,
  onClose,
  children,
  actions,
  className = "",
  bodyClassName = "",
}) {
  return (
    <Component
      ref={innerRef}
      className={[
        "rounded-2xl border border-surface-border bg-surface-card/90 shadow-panel",
        className,
      ].join(" ")}
    >
      {(title || description || onClose || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-surface-border bg-surface-bg/30 px-5 py-4">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-base font-semibold text-content-primary">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-content-muted">{description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {onClose ? (
              <IconButton
                icon={X}
                label={`Close ${title || "panel"}`}
                title="Close"
                variant="ghost"
                onClick={onClose}
              />
            ) : null}
          </div>
        </div>
      )}
      <div className={["p-5", bodyClassName].join(" ")}>{children}</div>
    </Component>
  );
}
