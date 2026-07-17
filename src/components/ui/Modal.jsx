import React, { useId, useRef } from "react";
import { createPortal } from "react-dom";
import IconButton from "./IconButton";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";

const sizes = {
  xs: "max-w-md",
  sm: "max-w-lg",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  "2xl": "max-w-4xl",
  "3xl": "max-w-5xl",
};

export default function Modal({
  open = true,
  title,
  description,
  onClose,
  children,
  footer,
  size = "lg",
  maxWidth,
  panelRef,
  closeDisabled = false,
  closeLabel = "Close",
  className = "",
  bodyClassName = "p-5",
}) {
  const localRef = useRef(null);
  const generatedId = useId();
  const titleId = title ? `${generatedId}-title` : undefined;
  const descriptionId = description ? `${generatedId}-description` : undefined;
  const hasBody = React.Children.count(children) > 0;

  useDismissibleLayer({
    open,
    layerRef: localRef,
    onDismiss: onClose,
    dismissOnEscape: !closeDisabled,
    dismissOnPointerOutside: !closeDisabled,
    trapFocus: true,
    lockScroll: true,
    restoreFocus: true,
  });

  if (!open) return null;

  const setRefs = (node) => {
    localRef.current = node;
    if (typeof panelRef === "function") panelRef(node);
    else if (panelRef) panelRef.current = node;
  };

  const dialog = (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto bg-backdrop/75 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-md sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        ref={setRefs}
        tabIndex={-1}
        className={[
          "relative flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full flex-col overflow-hidden rounded-dialog border border-surface-border/80 bg-surface-card shadow-dialog sm:max-h-[calc(100dvh-2.5rem)]",
          maxWidth || sizes[size] || sizes.lg,
          className,
        ].join(" ")}
      >
        {title || onClose ? (
          <div
            className={[
              "flex shrink-0 items-start justify-between gap-4 bg-surface-elevated/55 px-5 py-4 sm:px-6 sm:py-5",
              hasBody ? "border-b border-surface-border/65" : "",
            ].join(" ")}
          >
            <div className="min-w-0">
              {title ? (
                <h2
                  id={titleId}
                  className="text-xl font-semibold tracking-tight text-content-primary sm:text-2xl"
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p
                  id={descriptionId}
                  className="mt-1.5 max-w-2xl text-sm leading-6 text-content-muted"
                >
                  {description}
                </p>
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
                className="h-9 w-9 border border-surface-border/65 bg-surface-elevated/35"
              />
            ) : null}
          </div>
        ) : null}

        {hasBody ? (
          <div
            className={[bodyClassName, "min-h-0 flex-1 overflow-y-auto"].join(
              " ",
            )}
          >
            {children}
          </div>
        ) : null}

        {footer ? (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-surface-border/65 bg-surface-elevated/55 p-4 [&>*]:w-full min-[420px]:flex-row min-[420px]:justify-end min-[420px]:gap-3 min-[420px]:p-5 min-[420px]:[&>*]:w-auto">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}
