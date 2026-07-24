import React, { useId, useRef } from "react";
import { createPortal } from "react-dom";
import IconButton from "./IconButton";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";

export default function Sheet({
  open = true,
  title,
  description,
  onClose,
  children,
  footer,
  closeLabel = "Close",
  closeDisabled = false,
  panelRef,
  initialFocusRef,
  className = "",
  bodyClassName = "",
}) {
  const localRef = useRef(null);
  const generatedId = useId();
  const titleId = title ? `${generatedId}-title` : undefined;
  const descriptionId = description ? `${generatedId}-description` : undefined;

  useDismissibleLayer({
    open,
    layerRef: localRef,
    onDismiss: onClose,
    dismissOnEscape: !closeDisabled,
    dismissOnPointerOutside: !closeDisabled,
    trapFocus: true,
    lockScroll: true,
    restoreFocus: true,
    initialFocusRef,
  });

  if (!open) return null;

  const setRefs = (node) => {
    localRef.current = node;
    if (typeof panelRef === "function") panelRef(node);
    else if (panelRef) panelRef.current = node;
  };

  const sheet = (
    <div
      className="fixed inset-0 z-modal flex items-end justify-center bg-backdrop/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        ref={setRefs}
        tabIndex={-1}
        className={[
          "flex max-h-[min(82dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-dialog border border-b-0 border-surface-border/80 bg-surface-card pb-[env(safe-area-inset-bottom)] shadow-dialog",
          className,
        ].join(" ")}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-border/65 bg-surface-elevated/55 px-4 py-4">
          <div className="min-w-0">
            {title ? (
              <h2
                id={titleId}
                className="text-xl font-semibold tracking-tight text-content-primary"
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p
                id={descriptionId}
                className="mt-1 text-sm leading-5 text-content-muted"
              >
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            label={closeLabel}
            title={closeLabel}
            variant="ghost"
            onClick={onClose}
            disabled={closeDisabled}
            className="border border-surface-border/65 bg-surface-elevated/35"
          />
        </div>

        <div
          className={[
            "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4",
            bodyClassName,
          ].join(" ")}
        >
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-surface-border/65 bg-surface-elevated/55 p-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? sheet
    : createPortal(sheet, document.body);
}
