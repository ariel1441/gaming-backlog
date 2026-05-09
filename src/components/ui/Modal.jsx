import React, { useEffect, useRef } from "react";
import IconButton from "./IconButton";

export default function Modal({
  open = true,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidth = "max-w-2xl",
  panelRef,
  closeDisabled = false,
  closeLabel = "Close",
  className = "",
  bodyClassName = "p-5",
}) {
  const localRef = useRef(null);

  useEffect(() => {
    if (!open || closeDisabled) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDisabled, onClose, open]);

  if (!open) return null;

  const setRefs = (node) => {
    localRef.current = node;
    if (typeof panelRef === "function") panelRef(node);
    else if (panelRef) panelRef.current = node;
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      onMouseDown={(event) => {
        if (!closeDisabled && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        ref={setRefs}
        className={[
          "relative w-full rounded-xl border border-surface-border bg-surface-card shadow-xl",
          "max-h-[calc(100vh-2rem)] overflow-hidden",
          maxWidth,
          className,
        ].join(" ")}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-surface-border bg-surface-bg/35 p-5">
            <div className="min-w-0">
              {title ? (
                <h2
                  id="modal-title"
                  className="text-xl font-semibold text-content-primary"
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm text-content-muted">{description}</p>
              ) : null}
            </div>

            {onClose ? (
              <IconButton
                icon={undefined}
                label={closeLabel}
                title={closeLabel}
                variant="ghost"
                onClick={onClose}
                disabled={closeDisabled}
              />
            ) : null}
          </div>
        )}

        <div className={[bodyClassName, "max-h-[calc(100vh-9rem)] overflow-y-auto"].join(" ")}>
          {children}
        </div>

        {footer ? (
          <div className="flex justify-end gap-3 border-t border-surface-border bg-surface-bg/35 p-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
