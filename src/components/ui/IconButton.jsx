import React, { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const variants = {
  primary:
    "border border-action-primary bg-action-primary text-content-on-primary shadow-control hover:border-action-primary-hover hover:bg-action-primary-hover",
  default:
    "border border-surface-border bg-surface-card/90 text-content-primary shadow-sm hover:border-secondary/60 hover:bg-surface-elevated hover:text-secondary-light",
  ghost:
    "border border-transparent bg-transparent text-content-muted hover:border-surface-border hover:bg-surface-elevated/70 hover:text-content-primary",
  danger:
    "border border-surface-border bg-surface-card/90 text-content-primary hover:border-action-danger hover:bg-action-danger hover:text-content-on-danger",
};

export default function IconButton({
  icon: Icon = X,
  label,
  title,
  variant = "default",
  size = "md",
  className = "",
  ...props
}) {
  const buttonRef = useRef(null);
  const tooltipId = useId();
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const accessibleLabel = label || title;
  const sizeClass = size === "sm" ? "h-10 w-10" : "h-11 w-11";
  const showTooltip = () => {
    const bounds = buttonRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const placeBelow = bounds.top < 64;
    setTooltipPosition({
      left: bounds.left + bounds.width / 2,
      top: placeBelow ? bounds.bottom + 8 : bounds.top - 8,
      placeBelow,
    });
  };
  const hideTooltip = () => setTooltipPosition(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={accessibleLabel}
        aria-describedby={tooltipPosition ? tooltipId : undefined}
        {...props}
        onMouseEnter={(event) => {
          props.onMouseEnter?.(event);
          showTooltip();
        }}
        onMouseLeave={(event) => {
          props.onMouseLeave?.(event);
          hideTooltip();
        }}
        onFocus={(event) => {
          props.onFocus?.(event);
          if (event.currentTarget.matches(":focus-visible")) showTooltip();
        }}
        onBlur={(event) => {
          props.onBlur?.(event);
          hideTooltip();
        }}
        className={[
          "inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,border-color,color,box-shadow,transform]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg",
          "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0",
          "aria-busy:cursor-wait aria-busy:opacity-80",
          sizeClass,
          variants[variant] || variants.default,
          className,
        ].join(" ")}
      >
        <Icon
          className={size === "sm" ? "h-4 w-4" : "h-5 w-5"}
          aria-hidden="true"
        />
      </button>
      {accessibleLabel &&
      tooltipPosition &&
      typeof document !== "undefined"
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-tooltip max-w-64 rounded-lg border border-surface-border bg-surface-elevated px-2.5 py-1.5 text-center text-xs font-medium leading-4 text-content-primary shadow-menu"
              style={{
                left: tooltipPosition.left,
                top: tooltipPosition.top,
                transform: tooltipPosition.placeBelow
                  ? "translateX(-50%)"
                  : "translate(-50%, -100%)",
              }}
            >
              {accessibleLabel}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
