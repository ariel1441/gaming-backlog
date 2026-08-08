import { useMemo, useState, useCallback, useEffect } from "react";
import { hoursValueForList } from "../utils/hours";
import { personalGenreNames } from "../utils/gameList";

function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") return raw.split(",");
  return [];
}

export function useFilters(games, opts = {}) {
  // ----- basic state -----
  const [searchQuery, setSearchQuery] = useState(opts.initialSearch || "");
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedMyGenres, setSelectedMyGenres] = useState([]);
  const [dateFilter, setDateFilter] = useState(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortKey, setSortKey] = useState(opts.initialSortKey || "");
  const [isReversed, setIsReversed] = useState(!!opts.initialReverse);

  // ----- togglers -----
  const toggleStatus = useCallback((status) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  }, []);
  const toggleGenre = useCallback((genre) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }, []);
  const toggleMyGenre = useCallback((genre) => {
    setSelectedMyGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }, []);

  // ----- option lists -----
  const allGenres = useMemo(() => {
    const set = new Set();
    for (const g of games) {
      for (const name of toArray(g.genres)) {
        const v = String(name).trim();
        if (v) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [games]);

  const allMyGenres = useMemo(() => {
    const set = new Set();
    for (const g of games) {
      for (const name of personalGenreNames(g)) {
        const v = String(name).trim();
        if (v) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [games]);

  // ===== hours filter =====
  const hoursBounds = useMemo(() => {
    let lo = Infinity,
      hi = -Infinity;
    for (const g of games) {
      const h = Number(hoursValueForList(g));
      if (Number.isFinite(h)) {
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 0 };
    return { min: Math.max(0, Math.floor(lo)), max: Math.ceil(hi) };
  }, [games]);

  const [hoursRange, setHoursRange] = useState(null);
  const [hoursInitialized, setHoursInitialized] = useState(false);

  // one-time init to full span, then clamp on dataset changes
  useEffect(() => {
    if (!hoursInitialized && hoursBounds.max > hoursBounds.min) {
      setHoursRange(hoursBounds);
      setHoursInitialized(true);
      return;
    }
    if (hoursInitialized && hoursRange) {
      const nextMin = Math.max(
        hoursBounds.min,
        Math.min(hoursRange.min, hoursBounds.max),
      );
      const nextMax = Math.min(
        hoursBounds.max,
        Math.max(hoursRange.max, hoursBounds.min),
      );
      if (nextMin !== hoursRange.min || nextMax !== hoursRange.max) {
        setHoursRange({ min: nextMin, max: nextMax });
      }
    }
  }, [hoursBounds, hoursInitialized, hoursRange]);

  // reset filters
  const clearFilters = useCallback(() => {
    setSelectedStatuses([]);
    setSelectedGenres([]);
    setSelectedMyGenres([]);
    setDateFilter(null);
    setSourceFilter("all");
    setSearchQuery("");
    if (hoursBounds.max > hoursBounds.min) setHoursRange(hoursBounds);
  }, [hoursBounds]);

  return {
    // state
    searchQuery,
    setSearchQuery,
    selectedStatuses,
    setSelectedStatuses,
    selectedGenres,
    setSelectedGenres,
    selectedMyGenres,
    setSelectedMyGenres,
    dateFilter,
    setDateFilter,
    sourceFilter,
    setSourceFilter,
    sortKey,
    setSortKey,
    isReversed,
    setIsReversed,

    // togglers
    toggleStatus,
    toggleGenre,
    toggleMyGenre,
    clearFilters,

    // derived option lists
    allGenres,
    allMyGenres,

    // hours API
    hoursBounds,
    hoursRange,
    setHoursRange,
  };
}
