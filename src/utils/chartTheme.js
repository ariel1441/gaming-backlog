import { useCallback, useEffect, useMemo, useState } from "react";

const FALLBACKS = {
  axisTick: "rgb(148 163 184)",
  gridStroke: "rgb(38 52 72)",
  tooltipBg: "rgb(18 26 39)",
  tooltipBorder: "rgb(38 52 72)",
  tooltipText: "rgb(249 250 251)",
  tooltipMuted: "rgb(148 163 184)",
  cursor: "transparent",
};

function readCssVar(name, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function readChartTheme() {
  return {
    palette: Array.from({ length: 12 }, (_, index) =>
      readCssVar(`--chart-${index + 1}`, "rgb(148 163 184)"),
    ),
    axisTick: readCssVar("--axis-tick", FALLBACKS.axisTick),
    gridStroke: readCssVar("--grid-stroke", FALLBACKS.gridStroke),
    tooltip: {
      bg: readCssVar("--tooltip-bg", FALLBACKS.tooltipBg),
      border: readCssVar("--tooltip-border", FALLBACKS.tooltipBorder),
      text: readCssVar("--tooltip-text", FALLBACKS.tooltipText),
      muted: readCssVar("--tooltip-muted", FALLBACKS.tooltipMuted),
    },
    cursor: readCssVar("--chart-cursor", FALLBACKS.cursor),
  };
}

export function useChartTheme() {
  const [theme, setTheme] = useState(readChartTheme);

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setTheme(readChartTheme());
    const observer = new MutationObserver(updateTheme);

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    window.addEventListener("storage", updateTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", updateTheme);
    };
  }, []);

  const colorAt = useCallback(
    (index) => theme.palette[index % theme.palette.length],
    [theme.palette],
  );
  const axisTick = useCallback(() => theme.axisTick, [theme.axisTick]);
  const gridStroke = useCallback(() => theme.gridStroke, [theme.gridStroke]);
  const tooltipColors = useCallback(() => theme.tooltip, [theme.tooltip]);
  const chartCursor = useMemo(
    () => ({ fill: theme.cursor }),
    [theme.cursor],
  );

  return {
    palette: theme.palette,
    colorAt,
    axisTick,
    gridStroke,
    tooltipColors,
    chartCursor,
  };
}
