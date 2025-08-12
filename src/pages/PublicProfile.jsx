// src/pages/PublicProfile.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";

import GameGrid from "../components/GameGrid";
import GameModal from "../components/GameModal";
import FilterPanel from "../components/FilterPanel";
import { smartFuzzySearch } from "../utils/fuzzySearch";

import { listPublicGames, getPublicProfile } from "../services/publicService";
import { useStatuses } from "../hooks/useStatuses";
import { useFilters } from "../hooks/useFilters";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

export default function PublicProfile() {
  const { username } = useParams();

  // profile + games
  const [profile, setProfile] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // modal
  const [selectedGame, setSelectedGame] = useState(null);

  // visibility controls (keep UI unchanged)
  const [filterVisible, setFilterVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);

  // refs (for smooth scroll; unchanged)
  const filterRef = useRef(null);
  const searchRef = useRef(null);
  const sortRef = useRef(null);

  // Load public profile + games via services
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError("");

        const [p, g] = await Promise.all([
          getPublicProfile(username, { signal: ac.signal, auth: false }),
          listPublicGames(username, { signal: ac.signal, auth: false }),
        ]);

        setProfile(p || null);

        // normalize RAWG rating key like private view
        const list = (
          Array.isArray(g) ? g : Array.isArray(g?.games) ? g.games : []
        )?.map((x) => ({
          ...x,
          rawgRating: x.rating ?? x.rawgRating ?? 0,
        }));
        setGames(list || []);
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [username]);

  // Global statuses (cached). If none available publicly, derive simple string list from games.
  const { statuses: apiStatuses } = useStatuses();
  const derivedStatuses = useMemo(() => {
    if (!games?.length) return [];
    const set = new Set(games.map((g) => String(g.status)).filter(Boolean));
    return Array.from(set).sort(); // strings (FilterPanel expects strings)
  }, [games]);
  const allStatuses = apiStatuses?.length ? apiStatuses : derivedStatuses;

  // Shared filter/search/sort logic (exact same hook as private view)
  const {
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
    toggleStatus,
    toggleGenre,
    toggleMyGenre,
    clearFilters,
    filteredGames,
    allGenres,
    allMyGenres,
    noFiltersActive,
  } = useFilters(games, { statuses: allStatuses });

  const debouncedQuery = useDebouncedValue(searchQuery, 120);

  // mirror private scrolling UX
  useEffect(() => {
    if (filterVisible && filterRef.current) {
      filterRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filterVisible]);
  useEffect(() => {
    if (searchVisible && searchRef.current) {
      searchRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [searchVisible]);
  useEffect(() => {
    if (sortVisible && sortRef.current) {
      sortRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [sortVisible]);

  // IMPORTANT: same helper signature that App.jsx passes to FilterPanel
  const handleCheckboxToggle = (value, listSetter, currentList) => {
    listSetter(
      currentList.includes(value)
        ? currentList.filter((v) => v !== value)
        : [...currentList, value]
    );
  };

  const resetFilters = () => clearFilters();
  const clearSearch = () => setSearchQuery("");
  const clearSort = () => {
    setSortKey("");
    setIsReversed(false);
  };

  // When searching, apply ONLY non-search filters, then fuzzy search
  const normalize = (s = "") => s.toLowerCase().trim();

  const applyNonSearchFilters = (items) => {
    return (items || []).filter((g) => {
      // Status
      if (selectedStatuses?.length && !selectedStatuses.includes(g.status))
        return false;

      // Genre (CSV like "Action, RPG")
      if (selectedGenres?.length) {
        const gameGenres = (g.genres || "")
          .toLowerCase()
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        const wanted = new Set(selectedGenres.map(normalize));
        if (!gameGenres.some((gg) => wanted.has(gg))) return false;
      }

      // My genre (single string)
      if (selectedMyGenres?.length) {
        const myg = normalize(g.my_genre || "");
        if (!selectedMyGenres.map(normalize).includes(myg)) return false;
      }

      return true;
    });
  };

  const basePublicGames = debouncedQuery?.trim()
    ? applyNonSearchFilters(games)
    : noFiltersActive
      ? games
      : filteredGames || [];

  // Default order comparator: status_rank → position → id
  const sortByDefault = (a, b) => {
    const sr = (g) => g?.status_rank ?? 999;
    const pos = (g) => g?.position ?? Number.POSITIVE_INFINITY;
    const num = (v) => (Number.isFinite(+v) ? +v : Number.MAX_SAFE_INTEGER);
    if (sr(a) !== sr(b)) return sr(a) - sr(b);
    if (pos(a) !== pos(b)) return pos(a) - pos(b);
    return num(a?.id) - num(b?.id);
  };

  const listAfterSearch = debouncedQuery?.trim()
    ? smartFuzzySearch(basePublicGames, debouncedQuery)
    : basePublicGames;

  const displayGames = [...listAfterSearch].sort(sortByDefault);

  // ---------- UI below unchanged ----------
  if (loading) {
    return (
      <div className="flex h-screen bg-surface-bg text-content-primary items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-state-error">
        Error: {error} –{" "}
        <Link to="/" className="underline">
          Go home
        </Link>
      </div>
    );
  }

  if (!profile?.is_public) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">This profile is not public.</h1>
        <Link to="/" className="underline">
          Back to app
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-bg text-content-primary">
      <header className="p-6 border-b border-surface-border">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">@{profile.username}</h1>
            <p className="text-content-muted text-sm">
              {profile.game_count} games · joined{" "}
              {new Date(profile.joined_at).toLocaleDateString()}
            </p>
          </div>
          <Link to="/" className="text-primary hover:underline">
            Back to app
          </Link>
        </div>
      </header>

      <main className="w-full max-w-none p-6">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSearchVisible((v) => !v)}
            className="px-3 py-1.5 rounded bg-surface-card border border-surface-border hover:border-primary transition"
            aria-expanded={searchVisible}
          >
            {searchVisible ? "Hide Search" : "Show Search"}
          </button>
          <button
            onClick={() => setSortVisible((v) => !v)}
            className="px-3 py-1.5 rounded bg-surface-card border border-surface-border hover:border-primary transition"
            aria-expanded={sortVisible}
          >
            {sortVisible ? "Hide Sort" : "Show Sort"}
          </button>
          <button
            onClick={() => setFilterVisible((v) => !v)}
            className="px-3 py-1.5 rounded bg-surface-card border border-surface-border hover:border-primary transition"
            aria-expanded={filterVisible}
          >
            {filterVisible ? "Hide Filters" : "Show Filters"}
          </button>
        </div>

        {/* Search */}
        {searchVisible && (
          <div
            ref={searchRef}
            className="mb-6 p-6 bg-surface-card rounded-lg border border-surface-border"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-primary">
                Search Games
              </h3>
              <button
                onClick={() => setSearchVisible(false)}
                className="text-content-muted hover:text-content-primary transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search by game name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-elevated border border-surface-border rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                onClick={clearSearch}
                className="px-4 py-2 bg-action-danger hover:bg-action-danger-hover text-content-primary rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
            {searchQuery && (
              <p className="mt-2 text-sm text-content-muted">
                Searching for: "{searchQuery}" ({displayGames.length} results)
              </p>
            )}
          </div>
        )}

        {/* Sort */}
        {sortVisible && (
          <div
            ref={sortRef}
            className="mb-6 p-6 bg-surface-card rounded-lg border border-surface-border"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-primary">Sort Games</h3>
              <button
                onClick={() => setSortVisible(false)}
                className="text-content-muted hover:text-content-primary transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-4 items-center flex-wrap">
              <div className="flex gap-2 items-center">
                <label className="text-sm text-content-muted">Sort by:</label>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  className="px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-content-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Default (Status & Position)</option>
                  <option value="name">Name</option>
                  <option value="hoursPlayed">Hours Played</option>
                  <option value="rawgRating">RAWG Rating</option>
                  <option value="metacritic">Metacritic Score</option>
                  <option value="releaseDate">Release Date</option>
                </select>
              </div>

              <div className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  id="reverse-sort"
                  checked={isReversed}
                  onChange={(e) => setIsReversed(e.target.checked)}
                  className="w-4 h-4 text-primary bg-surface-elevated border-surface-border rounded focus:ring-primary"
                />
                <label
                  htmlFor="reverse-sort"
                  className="text-sm text-content-muted"
                >
                  Reverse Order
                </label>
              </div>

              <button
                onClick={clearSort}
                className="px-4 py-2 bg-action-danger hover:bg-action-danger-hover text-content-primary rounded-lg transition-colors"
              >
                Clear Sort
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        {filterVisible && (
          <FilterPanel
            filterRef={filterRef}
            allStatuses={allStatuses}
            allGenres={allGenres}
            allMyGenres={allMyGenres}
            selectedStatuses={selectedStatuses}
            selectedGenres={selectedGenres}
            selectedMyGenres={selectedMyGenres}
            // IMPORTANT: same signature App.jsx passes
            handleCheckboxToggle={(v, list, setList) =>
              handleCheckboxToggle(v, setList, list)
            }
            setSelectedStatuses={setSelectedStatuses}
            setSelectedGenres={setSelectedGenres}
            setSelectedMyGenres={setSelectedMyGenres}
            resetFilters={resetFilters}
            toggleStatus={toggleStatus}
            toggleGenre={toggleGenre}
            toggleMyGenre={toggleMyGenre}
          />
        )}

        {/* Read-only grid (unchanged) */}
        <GameGrid
          games={displayGames}
          onSelectGame={setSelectedGame}
          onEditGame={() => {}}
          onDeleteGame={() => {}}
          onReorder={null}
        />

        {selectedGame && (
          <GameModal
            game={selectedGame}
            onClose={() => setSelectedGame(null)}
          />
        )}
      </main>
    </div>
  );
}
