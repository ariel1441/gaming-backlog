import { useMemo, useState, useCallback, useEffect } from "react";
import { useDebouncedValue } from "./useDebouncedValue";

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
  const [sortKey, setSortKey] = useState(opts.initialSortKey || "");
  const [isReversed, setIsReversed] = useState(!!opts.initialReverse);

  const debouncedSearch = useDebouncedValue(searchQuery, 200);

  // ----- togglers -----
  const toggleStatus = useCallback((status) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  }, []);
  const toggleGenre = useCallback((genre) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }, []);
  const toggleMyGenre = useCallback((genre) => {
    setSelectedMyGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
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
      for (const name of toArray(g.my_genre)) {
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
      const h = Number(g?.how_long_to_beat);
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
        Math.min(hoursRange.min, hoursBounds.max)
      );
      const nextMax = Math.min(
        hoursBounds.max,
        Math.max(hoursRange.max, hoursBounds.min)
      );
      if (nextMin !== hoursRange.min || nextMax !== hoursRange.max) {
        setHoursRange({ min: nextMin, max: nextMax });
      }
    }
  }, [hoursBounds, hoursInitialized, hoursRange]);

  // debounce hours so filtering is smooth while dragging
  const debouncedHoursRange = useDebouncedValue(hoursRange, 120);

  const isHoursActive =
    hoursBounds.max > hoursBounds.min &&
    !!debouncedHoursRange &&
    (debouncedHoursRange.min > hoursBounds.min ||
      debouncedHoursRange.max < hoursBounds.max);

  // reset filters
  const clearFilters = useCallback(() => {
    setSelectedStatuses([]);
    setSelectedGenres([]);
    setSelectedMyGenres([]);
    setSearchQuery("");
    if (hoursBounds.max > hoursBounds.min) setHoursRange(hoursBounds);
  }, [hoursBounds]);

  // fast path when nothing active
  const noFiltersActive =
    !debouncedSearch &&
    selectedStatuses.length === 0 &&
    selectedGenres.length === 0 &&
    selectedMyGenres.length === 0 &&
    !isHoursActive &&
    !sortKey;

  // status rank map for fast default sorting
  const statusRankMap = useMemo(() => {
    const map = new Map();
    for (const s of opts.statuses || []) {
      map.set(String(s.status), Number.isFinite(s.rank) ? s.rank : 1e9);
    }
    return map;
  }, [opts.statuses]);

  // compute filtered + sorted list
  const filteredGames = useMemo(() => {
    if (!games?.length) return [];
    if (noFiltersActive) return games;

    const q = (debouncedSearch || "").trim().toLowerCase();

    const statusesFilter = selectedStatuses.length
      ? new Set(selectedStatuses.map((s) => String(s).trim().toLowerCase()))
      : null;
    const genresFilter = selectedGenres.length
      ? new Set(selectedGenres.map((s) => String(s).trim().toLowerCase()))
      : null;
    const myGenresFilter = selectedMyGenres.length
      ? new Set(selectedMyGenres.map((s) => String(s).trim().toLowerCase()))
      : null;

    const pass = (g) => {
      if (statusesFilter) {
        const s = String(g.status).trim().toLowerCase();
        if (!statusesFilter.has(s)) return false;
      }
      if (genresFilter) {
        const raw = toArray(g.genres);
        if (!raw.some((x) => genresFilter.has(String(x).trim().toLowerCase())))
          return false;
      }
      if (myGenresFilter) {
        const raw = toArray(g.my_genre);
        if (
          !raw.some((x) => myGenresFilter.has(String(x).trim().toLowerCase()))
        )
          return false;
      }
      if (q) {
        const name = String(g.name || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (isHoursActive) {
        const h = Number(g?.how_long_to_beat);
        if (!Number.isFinite(h)) return false;
        if (h < debouncedHoursRange.min || h > debouncedHoursRange.max)
          return false;
      }
      return true;
    };

    const out = games.filter(pass);

    const byNum = (v) =>
      v == null || Number.isNaN(Number(v)) ? -Infinity : Number(v);
    const byDate = (v) => (v ? Date.parse(v) || 0 : 0);
    const rankOf = (s) => statusRankMap.get(String(s)) ?? 1e9;

    const sorter = (a, b) => {
      switch (sortKey) {
        case "name":
          return String(a.name || "").localeCompare(
            String(b.name || ""),
            undefined,
            { sensitivity: "base" }
          );
        case "hoursPlayed":
          return (
            byNum(a.hoursPlayed ?? a.how_long_to_beat) -
            byNum(b.hoursPlayed ?? b.how_long_to_beat)
          );
        case "rawgRating":
          return (
            byNum(a.rawgRating ?? a.rating) - byNum(b.rawgRating ?? b.rating)
          );
        case "metacritic":
          return byNum(a.metacritic) - byNum(b.metacritic);
        case "releaseDate":
          return (
            byDate(a.releaseDate ?? a.released) -
            byDate(b.releaseDate ?? b.released)
          );
        default: {
          const r = rankOf(a.status) - rankOf(b.status);
          if (r !== 0) return r;
          const pa = byNum(a.position);
          const pb = byNum(b.position);
          if (pa !== pb) return pa - pb;
          return String(a.name || "").localeCompare(
            String(b.name || ""),
            undefined,
            { sensitivity: "base" }
          );
        }
      }
    };

    out.sort(sorter);
    if (isReversed) out.reverse();
    return out;
  }, [
    games,
    noFiltersActive,
    debouncedSearch,
    selectedStatuses,
    selectedGenres,
    selectedMyGenres,
    sortKey,
    isReversed,
    isHoursActive,
    debouncedHoursRange,
    statusRankMap,
  ]);

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
    sortKey,
    setSortKey,
    isReversed,
    setIsReversed,

    // togglers
    toggleStatus,
    toggleGenre,
    toggleMyGenre,
    clearFilters,

    // derived
    filteredGames,
    allGenres,
    allMyGenres,
    noFiltersActive,

    // hours API
    hoursBounds,
    hoursRange,
    setHoursRange,
  };
}
