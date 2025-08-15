// src/hooks/useFilters.js
import { useMemo, useState, useCallback } from "react";
import { useDebouncedValue } from "./useDebouncedValue";
// (removed) this hook should be called by the list page component, not from inside useFilters
// import useApplyFiltersFromQuery from "../hooks/useApplyFiltersFromQuery";

/**
 * @param {Array} games
 * @param {object} opts
 *  - initialSearch
 *  - initialSortKey
 *  - initialReverse
 *  - statuses (optional) [{ status, rank }]
 */
export function useFilters(games, opts = {}) {
  const [searchQuery, setSearchQuery] = useState(opts.initialSearch || "");
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedMyGenres, setSelectedMyGenres] = useState([]);
  const [sortKey, setSortKey] = useState(opts.initialSortKey || "");
  const [isReversed, setIsReversed] = useState(!!opts.initialReverse);

  const debouncedSearch = useDebouncedValue(searchQuery, 200);

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
  const clearFilters = useCallback(() => {
    setSelectedStatuses([]);
    setSelectedGenres([]);
    setSelectedMyGenres([]);
    setSearchQuery("");
  }, []);

  // Build a status→rank map (if provided)
  const statusRankMap = useMemo(() => {
    const map = new Map();
    (opts.statuses || []).forEach((s) =>
      map.set(String(s.status), Number(s.rank) || 0)
    );
    return map;
  }, [opts.statuses]);

  // Options for checklists
  const allGenres = useMemo(() => {
    const set = new Set();
    for (const g of games) {
      const raw = Array.isArray(g.genres)
        ? g.genres
        : typeof g.genres === "string"
          ? g.genres.split(",")
          : [];
      for (const name of raw) {
        const v = String(name).trim();
        if (v) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [games]);

  const allMyGenres = useMemo(() => {
    const set = new Set();
    for (const g of games) {
      const raw = Array.isArray(g.my_genre)
        ? g.my_genre
        : typeof g.my_genre === "string"
          ? g.my_genre.split(",")
          : [];
      for (const name of raw) {
        const v = String(name).trim();
        if (v) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [games]);

  // Short-circuit: if nothing active, show raw games
  const noFiltersActive =
    !debouncedSearch &&
    selectedStatuses.length === 0 &&
    selectedGenres.length === 0 &&
    selectedMyGenres.length === 0 &&
    !sortKey;

  const filteredGames = useMemo(() => {
    if (!games?.length) return [];
    if (noFiltersActive) return games;

    const q = (debouncedSearch || "").trim().toLowerCase();

    // ✅ Normalize filter values to ensure URL-driven values (Title Case) match stored values (any case)
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
        const raw = Array.isArray(g.genres)
          ? g.genres
          : typeof g.genres === "string"
            ? g.genres.split(",")
            : [];
        if (!raw.some((x) => genresFilter.has(String(x).trim().toLowerCase())))
          return false;
      }

      if (myGenresFilter) {
        const raw = Array.isArray(g.my_genre)
          ? g.my_genre
          : typeof g.my_genre === "string"
            ? g.my_genre.split(",")
            : [];
        if (
          !raw.some((x) => myGenresFilter.has(String(x).trim().toLowerCase()))
        )
          return false;
      }

      if (q) {
        const name = String(g.name || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    };

    const out = games.filter(pass);

    const byNum = (v) =>
      v == null || Number.isNaN(Number(v)) ? -Infinity : Number(v);
    const byDate = (v) => (v ? Date.parse(v) || 0 : 0);
    const rankOf = (s) =>
      statusRankMap.size ? (statusRankMap.get(String(s)) ?? 1e9) : 0;

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
          // Default: status rank, then position, then name
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
  };
}
