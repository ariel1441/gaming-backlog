import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Chip from "./Chip";

function lineCount(widths, availableWidth, gap) {
  if (!widths.length) return 0;
  let lines = 1;
  let used = 0;
  for (const width of widths) {
    if (!used || used + gap + width <= availableWidth + 0.5) {
      used = used ? used + gap + width : width;
    } else {
      lines += 1;
      used = width;
    }
  }
  return lines;
}

/**
 * Shows as many tags as actually fit. Measurement always includes every tag,
 * so a list can grow again after moving from a narrow card to a wider layout.
 */
export default function AdaptiveChipList({
  items = [],
  variant = "personalGenre",
  maxLines = 1,
  className = "",
  chipClassName = "",
}) {
  const rootRef = useRef(null);
  const measureRef = useRef(null);
  const normalized = useMemo(() => [
    ...new Map(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .map((item) => [item.toLowerCase(), item]),
    ).values(),
  ], [items]);
  const signature = normalized.join("\u0000");
  const [visibleIndexes, setVisibleIndexes] = useState(() => normalized.map((_, index) => index));

  useLayoutEffect(() => {
    const root = rootRef.current;
    const measurement = measureRef.current;
    if (!root || !measurement) return undefined;

    const measure = () => {
      const availableWidth = root.clientWidth;
      if (!availableWidth) return;
      const chipWidths = [...measurement.querySelectorAll("[data-measure-chip]")]
        .map((chip) => Math.min(chip.getBoundingClientRect().width, availableWidth));
      const overflowWidths = new Map(
        [...measurement.querySelectorAll("[data-measure-overflow]")]
          .map((chip) => [Number(chip.dataset.measureOverflow), chip.getBoundingClientRect().width]),
      );
      const gap = Number.parseFloat(getComputedStyle(measurement).columnGap) || 0;
      const selected = [];

      chipWidths.forEach((width, index) => {
        const candidate = [...selected, index];
        const hiddenCount = normalized.length - candidate.length;
        const widths = candidate.map((candidateIndex) => chipWidths[candidateIndex]);
        if (hiddenCount) widths.push(overflowWidths.get(hiddenCount) || 0);
        if (lineCount(widths, availableWidth, gap) <= maxLines) selected.push(index);
      });

      setVisibleIndexes((current) => (
        current.length === selected.length && current.every((value, index) => value === selected[index])
          ? current
          : selected
      ));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [chipClassName, maxLines, normalized.length, signature, variant]);

  const visible = visibleIndexes.map((index) => normalized[index]).filter(Boolean);
  const hidden = normalized.length - visible.length;
  return (
    <div ref={rootRef} className={`relative flex min-w-0 flex-wrap gap-1.5 ${className}`} title={normalized.join(", ")}>
      {visible.map((item) => (
        <Chip key={item} data-adaptive-chip variant={variant} title={item} className={`max-w-full truncate ${chipClassName}`}>
          {item}
        </Chip>
      ))}
      {hidden ? <span data-adaptive-chip data-adaptive-overflow className="inline-flex shrink-0 items-center rounded-full border border-surface-border bg-surface-elevated/60 px-2.5 py-1 text-xs font-medium text-content-muted">+{hidden}</span> : null}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 -z-10 flex flex-wrap gap-1.5"
      >
        {normalized.map((item) => (
          <Chip key={item} data-measure-chip variant={variant} className={`max-w-full truncate ${chipClassName}`}>
            {item}
          </Chip>
        ))}
        {normalized.map((_, index) => {
          const count = index + 1;
          return <span key={count} data-measure-overflow={count} className="absolute inline-flex rounded-full border px-2.5 py-1 text-xs font-medium">+{count}</span>;
        })}
      </div>
    </div>
  );
}
