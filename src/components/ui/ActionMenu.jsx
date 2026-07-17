import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import Button from "./Button";
import PopoverPanel from "./PopoverPanel";

const VIEWPORT_GAP = 8;
const FALLBACK_MENU_HEIGHT = 180;
const FALLBACK_MENU_WIDTH = 176;

export default function ActionMenu({
  label = "More",
  ariaLabel,
  icon: Icon = MoreHorizontal,
  children,
  className = "",
  menuClassName = "",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const menuId = useId();
  const triggerId = `${menuId}-trigger`;
  const layerRef = useRef(null);

  if (!layerRef.current) {
    layerRef.current = {
      contains(node) {
        return (
          triggerRef.current?.contains(node) || panelRef.current?.contains(node)
        );
      },
      closest() {
        return null;
      },
    };
  }

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const bounds = trigger.getBoundingClientRect();
    const menuHeight =
      panelRef.current?.offsetHeight || FALLBACK_MENU_HEIGHT;
    const menuWidth = panelRef.current?.offsetWidth || FALLBACK_MENU_WIDTH;
    const spaceBelow = window.innerHeight - bounds.bottom - VIEWPORT_GAP;
    const spaceAbove = bounds.top - VIEWPORT_GAP;
    const placeAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const preferredLeft = bounds.right - menuWidth;
    const left = Math.min(
      Math.max(VIEWPORT_GAP, preferredLeft),
      Math.max(VIEWPORT_GAP, window.innerWidth - menuWidth - VIEWPORT_GAP),
    );

    setPosition({
      left,
      top: placeAbove
        ? bounds.top - VIEWPORT_GAP
        : bounds.bottom + VIEWPORT_GAP,
      placeAbove,
    });
  };

  const close = () => setOpen(false);

  useDismissibleLayer({
    open,
    layerRef,
    onDismiss: close,
  });

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      updatePosition();
      panelRef.current?.querySelector("button:not([disabled])")?.focus();
    });
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const menuContents =
    typeof children === "function" ? children({ close }) : children;
  const handleMenuKeyDown = (event) => {
    const items = panelRef.current
      ? [
          ...panelRef.current.querySelectorAll(
            '[role="menuitem"]:not([disabled])',
          ),
        ]
      : [];
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") {
      nextIndex = currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
      return;
    } else {
      return;
    }
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <>
      <Button
        ref={triggerRef}
        id={triggerId}
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-label={ariaLabel || label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className={className}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </Button>
      {open && position && typeof document !== "undefined"
        ? createPortal(
            <PopoverPanel
              ref={panelRef}
              id={menuId}
              role="menu"
              aria-labelledby={triggerId}
              onKeyDown={handleMenuKeyDown}
              padding="sm"
              radius="lg"
              shadow="elevated"
              className={[
                "fixed z-tooltip min-w-44",
                menuClassName,
              ].join(" ")}
              style={{
                left: position.left,
                top: position.top,
                transform: position.placeAbove
                  ? "translateY(-100%)"
                  : undefined,
              }}
            >
              {menuContents}
            </PopoverPanel>,
            document.body,
          )
        : null}
    </>
  );
}
