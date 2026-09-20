import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import PopoverPanel from "./PopoverPanel";

const VIEWPORT_GAP = 12;
const ANCHOR_GAP = 8;

export default function FloatingPopoverPanel({
  anchorRef,
  open,
  onDismiss,
  children,
  className = "",
  minWidth = 288,
}) {
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null);

  useDismissibleLayer({
    open,
    layerRef: panelRef,
    onDismiss,
    restoreFocus: true,
  });

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const availableBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP - ANCHOR_GAP;
      const availableAbove = rect.top - VIEWPORT_GAP - ANCHOR_GAP;
      const above = availableBelow < 240 && availableAbove > availableBelow;
      const width = Math.min(
        Math.max(minWidth, rect.width),
        window.innerWidth - VIEWPORT_GAP * 2,
      );
      const left = Math.min(
        Math.max(VIEWPORT_GAP, rect.left),
        window.innerWidth - VIEWPORT_GAP - width,
      );

      setPosition({
        left,
        top: above ? rect.top - ANCHOR_GAP : rect.bottom + ANCHOR_GAP,
        width,
        maxHeight: Math.max(144, above ? availableAbove : availableBelow),
        transform: above ? "translateY(-100%)" : "none",
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, minWidth, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <PopoverPanel
      ref={panelRef}
      padding="sm"
      radius="lg"
      style={position || { visibility: "hidden" }}
      className={`fixed z-tooltip flex min-h-0 flex-col overflow-hidden ${className}`}
    >
      {children}
    </PopoverPanel>,
    document.body,
  );
}
