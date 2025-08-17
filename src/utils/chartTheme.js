import { useMemo, useCallback } from "react";

const cssVar = (name) =>
  typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    : "";

export function useChartTheme() {
  const palette = useMemo(
    () =>
      Array.from(
        { length: 12 },
        (_, i) => cssVar(`--chart-${i + 1}`) || "#888"
      ),
    []
  );

  const colorAt = useCallback((i) => palette[i % palette.length], [palette]);

  const axisTick = useCallback(() => cssVar("--axis-tick") || "#9ca3af", []);
  const gridStroke = useCallback(
    () => cssVar("--grid-stroke") || "rgba(156,163,175,.25)",
    []
  );
  const tooltipColors = useCallback(
    () => ({
      bg: cssVar("--tooltip-bg") || "#1f2937",
      border: cssVar("--tooltip-border") || "#374151",
    }),
    []
  );

  return { palette, colorAt, axisTick, gridStroke, tooltipColors };
}
