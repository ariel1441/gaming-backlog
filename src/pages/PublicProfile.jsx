// src/pages/PublicProfile.jsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import GameGrid from "../components/GameGrid";
import GameModal from "../components/GameModal";
import FilterPanel from "../components/FilterPanel";
import { applyFiltersAndSort } from "../utils/applyFiltersAndSort";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export default function PublicProfile() {
  const { username } = useParams();

  // profile + games
  const [profile, setProfile] = useState(null);
  const [games, setGames] = useState([]);
  const [filteredGames, setFilteredGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // modal
  const [selectedGame, setSelectedGame] = useState(null);

  // controls visibility (collapsed by default now)
  const [filterVisible, setFilterVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);

  // filter/sort state (mirror private)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedMyGenres, setSelectedMyGenres] = useState([]);
  const [sortKey, setSortKey] = useState("");
  const [isReversed, setIsReversed] = useState(false);

  // statuses list (try backend first; fallback to derive from games)
  const [allStatuses, setAllStatuses] = useState([]);

  // refs for smooth scroll (mirror private)
  const filterRef = useRef(null);
  const searchRef = useRef(null);
  const sortRef = useRef(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        const [pRes, gRes] = await Promise.all([
          fetch(`${API_BASE}/api/public/${encodeURIComponent(username)}`),
          fetch(`${API_BASE}/api/public/${encodeURIComponent(username)}/games`),
        ]);
        if (!pRes.ok) throw new Error(`Profile error ${pRes.status}`);
        if (!gRes.ok) throw new Error(`Games error ${gRes.status}`);

        const [pJson, gJson] = await Promise.all([pRes.json(), gRes.json()]);
        if (!ignore) {
          setProfile(pJson);
          setGames(
            (gJson || []).map((g) => ({
              ...g,
              rawgRating: g.rating || 0, // normalize like private
            }))
          );
        }
      } catch (e) {
        setError(e.message || "Failed to load");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [username]);

  // try to fetch statuses list (no auth needed)
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/games/statuses-list`);
        if (res.ok) {
          const statuses = await res.json();
          if (!ignore) setAllStatuses(statuses || []);
        } else {
          const statuses = Array.from(
            new Set(games.map((g) => g.status).filter(Boolean))
          );
          if (!ignore) setAllStatuses(statuses);
        }
      } catch {
        const statuses = Array.from(
          new Set(games.map((g) => g.status).filter(Boolean))
        );
        if (!ignore) setAllStatuses(statuses);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [games]);

  // recompute filters & sort when state changes
  useEffect(() => {
    const next = applyFiltersAndSort(games, {
      searchQuery,
      selectedStatuses,
      selectedGenres,
      selectedMyGenres,
      sortKey,
      isReversed,
    });
    setFilteredGames(next);
  }, [
    games,
    searchQuery,
    selectedStatuses,
    selectedGenres,
    selectedMyGenres,
    sortKey,
    isReversed,
  ]);

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

  // derive genre lists from games
  const allGenres = [
    ...new Set(
      games
        .flatMap((g) => (g.genres || "").split(",").map((x) => x.trim()))
        .filter(Boolean)
    ),
  ].sort();
  const allMyGenres = [
    ...new Set(
      games
        .flatMap((g) => (g.my_genre || "").split(",").map((x) => x.trim()))
        .filter(Boolean)
    ),
  ].sort();

  const handleCheckboxToggle = (value, list, setList) => {
    setList((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedGenres([]);
    setSelectedMyGenres([]);
  };

  const clearSearch = () => setSearchQuery("");
  const clearSort = () => {
    setSortKey("");
    setIsReversed(false);
  };

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
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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

      <main className="max-w-6xl mx-auto p-6">
        {/* Toolbar buttons */}
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
                Searching for: "{searchQuery}" ({filteredGames.length} results)
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
            handleCheckboxToggle={handleCheckboxToggle}
            setSelectedStatuses={setSelectedStatuses}
            setSelectedGenres={setSelectedGenres}
            setSelectedMyGenres={setSelectedMyGenres}
            resetFilters={resetFilters}
          />
        )}

        {/* Read-only grid */}
        <GameGrid
          games={filteredGames}
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
