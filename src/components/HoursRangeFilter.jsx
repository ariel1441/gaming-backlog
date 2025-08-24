import React, { useMemo, useCallback, useRef, useState } from "react";

/**
 * Dual-handle hours slider (JS)
 * - Custom pointer drag on the track (inputs are invisible; kept for keyboard a11y).
 * - Prevents crossing; defaults to full span when value is missing.
 * - When handles overlap, first drag direction picks which handle moves (→ max, ← min).
 * - Uses a ref to keep active handle in sync for window listeners.
 * - No slider-specific reset button or helper text.
 */
export default function HoursRangeFilter({
  min = 0,
  max = 200,
  step = 1,
  value,
  disabled = false,
  onChange,
  onCommit,
}) {
  const containerRef = useRef(null);
  const startXRef = useRef(0);
  const pendingRef = useRef(false); // waiting for direction when overlapped
  const activeRef = useRef(null); // 'lo' | 'hi' | null (for listeners)
  const lastRef = useRef({ min, max }); // last emitted pair to avoid redundant updates
  const [active, setActive] = useState(null); // visual state only

  // Full-span fallback when value is missing
  const lo = typeof value?.min === "number" ? value.min : min;
  const hi = typeof value?.max === "number" ? value.max : max;
  const span = Math.max(1, max - min);

  const clamp = useCallback((v) => Math.min(max, Math.max(min, v)), [min, max]);
  const roundToStep = useCallback(
    (v) => {
      const q = Math.round((v - min) / step) * step + min;
      return Number.isFinite(q) ? +q.toFixed(6) : v; // avoid -0
    },
    [min, step]
  );

  const valueToPct = useCallback(
    (v) => ((clamp(v) - min) / span) * 100,
    [clamp, min, span]
  );

  const pct = useMemo(
    () => ({ left: valueToPct(lo), right: valueToPct(hi) }),
    [lo, hi, valueToPct]
  );

  const clientXFromEvent = (e) =>
    "touches" in e ? e.touches[0].clientX : e.clientX;

  const posToValue = useCallback(
    (clientX) => {
      const el = containerRef.current;
      if (!el) return lo;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const unclamped = min + ratio * (max - min);
      return roundToStep(clamp(unclamped));
    },
    [min, max, clamp, roundToStep, lo]
  );

  const emitIfChanged = (next) => {
    const prev = lastRef.current;
    if (prev.min !== next.min || prev.max !== next.max) {
      lastRef.current = next;
      onChange?.(next);
    }
  };

  const onPointerDown = useCallback(
    (e) => {
      if (disabled) return;
      e.preventDefault();

      const x = clientXFromEvent(e);
      startXRef.current = x;
      lastRef.current = { min: lo, max: hi };

      const v = posToValue(x);

      if (lo === hi) {
        // Overlapped: decide by first movement direction
        pendingRef.current = true;
        activeRef.current = null;
        setActive(null);
      } else {
        // Choose nearest handle immediately (tie → hi)
        const which = Math.abs(v - lo) < Math.abs(v - hi) ? "lo" : "hi";
        activeRef.current = which;
        setActive(which);
        if (which === "lo") {
          emitIfChanged({ min: Math.min(v, hi), max: hi });
        } else {
          emitIfChanged({ min: lo, max: Math.max(v, lo) });
        }
      }

      const move = (ev) => {
        const cx = clientXFromEvent(ev);
        const nv = posToValue(cx);

        // Resolve overlap by first movement direction
        if (pendingRef.current) {
          const dx = cx - startXRef.current;
          if (Math.abs(dx) < 2) return; // wait for clear intent
          const which = dx > 0 ? "hi" : "lo";
          pendingRef.current = false;
          activeRef.current = which;
          setActive(which);
        }

        if (activeRef.current === "lo") {
          emitIfChanged({ min: Math.min(nv, hi), max: hi });
        } else if (activeRef.current === "hi") {
          emitIfChanged({ min: lo, max: Math.max(nv, lo) });
        }
      };

      const up = () => {
        pendingRef.current = false;
        activeRef.current = null;
        setActive(null);
        onCommit?.({ min: lo, max: hi });
        window.removeEventListener("mousemove", move);
        window.removeEventListener("touchmove", move, { passive: false });
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchend", up);
      };

      window.addEventListener("mousemove", move);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("mouseup", up);
      window.addEventListener("touchend", up);
    },
    [disabled, lo, hi, posToValue, onCommit]
  );

  // Keyboard support via invisible native inputs
  const handleLoKey = useCallback(
    (e) => {
      if (disabled) return;
      const next = roundToStep(clamp(Number(e.target.value)));
      emitIfChanged({ min: Math.min(next, hi), max: hi });
    },
    [disabled, clamp, roundToStep, hi]
  );
  const handleHiKey = useCallback(
    (e) => {
      if (disabled) return;
      const next = roundToStep(clamp(Number(e.target.value)));
      emitIfChanged({ min: lo, max: Math.max(next, lo) });
    },
    [disabled, clamp, roundToStep, lo]
  );
  const commit = useCallback(() => {
    if (disabled) return;
    onCommit?.({ min: lo, max: hi });
  }, [disabled, onCommit, lo, hi]);

  const fullSpan = lo <= min && hi >= max;
  const label = fullSpan ? "Any length" : `${lo}–${hi} h`;

  return (
    <div className="w-full select-none">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-content-primary">Hours</div>
        <div
          className="text-xs tabular-nums text-content-muted"
          aria-live="polite"
        >
          {label}
        </div>
      </div>

      {/* Track container (captures drag) */}
      <div
        ref={containerRef}
        className="relative h-8"
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
      >
        {/* Base track */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-border"
        />
        {/* Active segment */}
        <div
          aria-hidden
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-content-secondary"
          style={{ left: `${pct.left}%`, right: `${100 - pct.right}%` }}
        />

        {/* Invisible range inputs (keyboard + a11y) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={handleLoKey}
          onMouseUp={commit}
          onTouchEnd={commit}
          disabled={disabled}
          aria-label="Minimum hours"
          aria-valuemin={min}
          aria-valuemax={hi}
          aria-valuenow={lo}
          className="absolute left-0 top-0 h-8 w-full opacity-0 focus:opacity-0"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={handleHiKey}
          onMouseUp={commit}
          onTouchEnd={commit}
          disabled={disabled}
          aria-label="Maximum hours"
          aria-valuemin={lo}
          aria-valuemax={max}
          aria-valuenow={hi}
          className="absolute left-0 top-0 h-8 w-full opacity-0 focus:opacity-0"
        />

        {/* Visual thumbs */}
        <Thumb style={{ left: `${pct.left}%` }} active={active === "lo"} />
        <Thumb style={{ left: `${pct.right}%` }} active={active === "hi"} />
      </div>
    </div>
  );
}

function Thumb({ style, active }) {
  return (
    <div
      aria-hidden
      style={{ width: 16, height: 16, ...style }}
      className={[
        "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full shadow",
        "ring-2",
        active
          ? "ring-primary bg-content-primary"
          : "ring-primary/60 bg-content-primary",
      ].join(" ")}
    />
  );
}
