import { useLayoutEffect, useRef, useState } from "react";
import Chip from "./Chip";

/**
 * Shows the tags the available line width can accommodate, instead of an
 * arbitrary count. The overflow counter is included in the fit calculation.
 */
export default function AdaptiveChipList({
  items = [],
  variant = "personalGenre",
  maxLines = 1,
  className = "",
  chipClassName = "",
}) {
  const rootRef = useRef(null);
  const skipNextResizeRef = useRef(false);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const normalized = items.filter(Boolean);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const measure = () => {
      const children = [...root.querySelectorAll("[data-adaptive-chip]")];
      if (!children.length) return;
      const rows = [];
      children.forEach((child, index) => {
        const top = child.offsetTop;
        if (!rows.length || rows[rows.length - 1].top !== top) rows.push({ top, end: index });
        else rows[rows.length - 1].end = index;
      });
      let fit = rows[Math.min(maxLines, rows.length) - 1]?.end + 1 || normalized.length;
      const overflow = root.querySelector("[data-adaptive-overflow]");
      if (overflow && rows.findIndex((row) => row.top === overflow.offsetTop) >= maxLines) {
        fit = Math.max(0, fit - 1);
      }
      setVisibleCount((current) => {
        if (current === fit) return current;
        skipNextResizeRef.current = true;
        return fit;
      });
    };

    measure();
    const observer = new ResizeObserver(() => {
      if (skipNextResizeRef.current) {
        skipNextResizeRef.current = false;
        return;
      }
      measure();
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [maxLines, normalized.length]);

  const visible = normalized.slice(0, visibleCount);
  const hidden = normalized.length - visible.length;
  return (
    <div ref={rootRef} className={`flex min-w-0 flex-wrap gap-1.5 ${className}`} title={normalized.join(", ")}>
      {visible.map((item) => (
        <Chip key={item} data-adaptive-chip variant={variant} title={item} className={`max-w-full truncate ${chipClassName}`}>
          {item}
        </Chip>
      ))}
      {hidden ? <span data-adaptive-chip data-adaptive-overflow className="inline-flex shrink-0 items-center rounded-full border border-surface-border bg-surface-elevated/60 px-2.5 py-1 text-xs font-medium text-content-muted">+{hidden}</span> : null}
    </div>
  );
}
