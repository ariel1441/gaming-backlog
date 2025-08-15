// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./contexts/AuthContext";

import Sidebar from "./components/Sidebar";
import FilterPanel from "./components/FilterPanel";
import AddGameForm from "./components/AddGameForm";
import GameGrid from "./components/GameGrid";
import GameModal from "./components/GameModal";
import EditGameForm from "./components/EditGameForm";
import AdminLoginForm from "./components/AdminLoginForm";
import PublicSettingsModal from "./components/PublicSettingsModal";
import PublicProfile from "./pages/PublicProfile";
import { smartFuzzySearch } from "./utils/fuzzySearch";

import { useGames } from "./hooks/useGames";
import { useStatuses } from "./hooks/useStatuses";
import { useFilters } from "./hooks/useFilters";
import { useUI } from "./hooks/useUI";
import { useDebouncedValue } from "./hooks/useDebouncedValue";

const AppContent = () => {
  const { isAuthenticated, loading: authLoading } = useAuth();

  const {
    games,
    loading: gamesLoading,
    error: gamesError,
    addGame,
    editGame,
    removeGame,
    refresh,
    reorderGame, // ← from hook (no success refresh)
  } = useGames();

  const { statuses: allStatuses } = useStatuses();

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
  } = useFilters(games, {
    initialSortKey: "",
    initialReverse: false,
    statuses: allStatuses,
  });

  const debouncedQuery = useDebouncedValue(searchQuery, 120);

  const {
    sidebarOpen,
    setSidebarOpen,
    filterVisible,
    setFilterVisible,
    searchVisible,
    setSearchVisible,
    sortVisible,
    setSortVisible,
    showAddForm,
    setShowAddForm,
    showPublicSettings,
    setShowPublicSettings,
    showAdminLogin,
    setShowAdminLogin,
    scrollIntoView,
  } = useUI({ sidebarOpen: true });

  const [selectedGame, setSelectedGame] = useState(null);
  const [surpriseGame, setSurpriseGame] = useState(null);
  const [editingGame, setEditingGame] = useState(null);

  const filterRef = useRef(null);
  const addFormRef = useRef(null);
  const searchRef = useRef(null);
  const sortRef = useRef(null);

  const [newGame, setNewGame] = useState({
    name: "",
    status: "",
    how_long_to_beat: "",
    my_genre: "",
    thoughts: "",
    my_score: "",
  });

  useEffect(() => {
    if (filterVisible) scrollIntoView(filterRef);
  }, [filterVisible, scrollIntoView]);
  useEffect(() => {
    if (showAddForm) scrollIntoView(addFormRef);
  }, [showAddForm, scrollIntoView]);
  useEffect(() => {
    if (searchVisible) scrollIntoView(searchRef);
  }, [searchVisible, scrollIntoView]);
  useEffect(() => {
    if (sortVisible) scrollIntoView(sortRef);
  }, [sortVisible, scrollIntoView]);

  const handleDeleteGame = async (gameId) => {
    if (!isAuthenticated) {
      alert("Sign in required to delete games.");
      return;
    }
    if (!confirm("Are you sure you want to delete this game?")) return;

    try {
      await removeGame(gameId);
    } catch (err) {
      console.error("Error deleting game:", err);
      alert("Failed to delete game. Please try again.");
    }
  };

  const handleSurpriseMe = () => {
    if (games.length > 0) {
      setSurpriseGame(games[Math.floor(Math.random() * games.length)]);
    }
  };

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

  const handleAddGame = async (e) => {
    e.preventDefault();
    try {
      const created = await addGame(newGame);
      setNewGame({
        name: "",
        status: "",
        how_long_to_beat: "",
        my_genre: "",
        thoughts: "",
        my_score: "",
      });
      setShowAddForm(false);
      if (!created) await refresh();
    } catch (err) {
      console.error("Error adding game:", err);
      alert("Failed to add game. Please try again.");
    }
  };

  const startEditing = (game) => {
    if (!isAuthenticated) {
      alert("Sign in required to edit games.");
      return;
    }
    setEditingGame(game);
  };

  // Final edit handler: PUT expects name+status; coerce numbers; accept camel/snake input
  const handleEditGame = async (draft) => {
    if (!isAuthenticated) {
      alert("Sign in required to edit games.");
      return;
    }

    const orig = editingGame || {};
    const pick = (snake, camel) =>
      draft?.[snake] !== undefined ? draft[snake] : draft?.[camel];

    const toIntOrNull = (v) =>
      v === "" || v == null
        ? null
        : Number.isNaN(parseInt(v, 10))
          ? null
          : parseInt(v, 10);
    const toNumOrNull = (v) =>
      v === "" || v == null ? null : Number.isNaN(Number(v)) ? null : Number(v);

    const body = {
      name: pick("name", "name") ?? orig.name ?? "",
      status: pick("status", "status") || orig.status || "",
      my_genre: pick("my_genre", "myGenre") ?? orig.my_genre ?? "",
      thoughts: pick("thoughts", "thoughts") ?? orig.thoughts ?? "",
      how_long_to_beat: toIntOrNull(
        pick("how_long_to_beat", "howLongToBeat") ?? orig.how_long_to_beat
      ),
      my_score: toNumOrNull(pick("my_score", "myScore") ?? orig.my_score),
    };

    // Canonical date: 'YYYY-MM-DD' string or null
    const canonDate = (v) =>
      v == null || v === "" ? null : String(v).slice(0, 10);

    const startedDraftRaw =
      draft?.started_at !== undefined ? draft.started_at : draft?.startedAt;
    const finishedDraftRaw =
      draft?.finished_at !== undefined ? draft.finished_at : draft?.finishedAt;

    // started_at: include only if changed (including clearing to null)
    if (startedDraftRaw !== undefined) {
      const next = canonDate(startedDraftRaw); // null if cleared
      const prev = canonDate(orig.started_at); // null or 'YYYY-MM-DD'
      if (next !== prev) body.started_at = next; // include key; null means clear
    }

    // finished_at: include only if changed (including clearing to null)
    if (finishedDraftRaw !== undefined) {
      const next = canonDate(finishedDraftRaw);
      const prev = canonDate(orig.finished_at);
      if (next !== prev) body.finished_at = next; // include key; null means clear
    }

    if (!body.name || !body.status) {
      alert("Name and status are required.");
      return;
    }

    try {
      await editGame(draft.id ?? orig.id, body);
      setEditingGame(null);
    } catch (err) {
      console.error("Error updating game:", err);
      alert(
        err?.details?.error ||
          err?.details?.message ||
          err?.message ||
          "Failed to update game. Please check your inputs and try again."
      );
    }
  };

  const handleReorderGames = (gameId, targetIndex, status) =>
    reorderGame(gameId, targetIndex, status).catch(async (err) => {
      console.error("Failed to reorder game:", err);
      alert("Failed to reorder game. Please try again.");
      await refresh(); // recover on failure only
    });

  if (authLoading || gamesLoading) {
    return (
      <div className="flex h-screen bg-surface-bg text-content-primary items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-primary"></div>
      </div>
    );
  }

  // NEW: treat auth errors as "guest" (no fatal screen)
  const isAuthError =
    gamesError && (gamesError.status === 401 || gamesError.status === 403);

  // Keep previous behavior for non-auth errors
  if (gamesError && !isAuthError) {
    return (
      <div className="flex h-screen bg-surface-bg text-content-primary items-center justify-center">
        <div className="text-state-error">
          {String(gamesError?.message || gamesError)}
        </div>
      </div>
    );
  }

  // Build base list (filters/sort), then apply smart fuzzy search if there's a query
  const normalize = (s = "") => s.toLowerCase().trim();

  const applyNonSearchFilters = (items) => {
    try {
      return items.filter((g) => {
        // Status filter
        if (selectedStatuses?.length && !selectedStatuses.includes(g.status))
          return false;

        // Genre filter (CSV like "Action, RPG")
        if (selectedGenres?.length) {
          const gameGenres = (g.genres || "")
            .toLowerCase()
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const wanted = new Set(selectedGenres.map(normalize));
          if (!gameGenres.some((gg) => wanted.has(gg))) return false;
        }

        // My-genre filter (single string)
        if (selectedMyGenres?.length) {
          const myg = normalize(g.my_genre || "");
          if (!selectedMyGenres.map(normalize).includes(myg)) return false;
        }

        return true;
      });
    } catch {
      return items;
    }
  };

  const baseGames = isAuthError
    ? []
    : debouncedQuery?.trim()
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

  // Fuzzy = filter only; keep default order unless user picked a sort
  const listAfterSearch = debouncedQuery?.trim()
    ? smartFuzzySearch(baseGames, debouncedQuery)
    : baseGames;

  const useDefaultSort = !sortKey || sortKey === "";
  const displayGames = useDefaultSort
    ? [...listAfterSearch].sort(sortByDefault)
    : listAfterSearch;

  return (
    <div className="flex h-screen bg-surface-bg text-content-primary overflow-hidden">
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        searchVisible={searchVisible}
        setSearchVisible={setSearchVisible}
        sortVisible={sortVisible}
        setSortVisible={setSortVisible}
        filterVisible={filterVisible}
        setFilterVisible={setFilterVisible}
        showAddForm={showAddForm}
        setShowAddForm={setShowAddForm}
        handleSurpriseMe={handleSurpriseMe}
        onShowAdminLogin={() => setShowAdminLogin(true)}
        onShowPublicSettings={() => setShowPublicSettings(true)}
      />

      <main className="flex-1 p-6 overflow-auto">
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

            {sortKey && (
              <p className="mt-2 text-sm text-content-muted">
                Sorted by: {sortKey}{" "}
                {isReversed ? "(descending)" : "(ascending)"}
              </p>
            )}
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

        {/* Add Game */}
        {showAddForm && (
          <AddGameForm
            addFormRef={addFormRef}
            newGame={newGame}
            setNewGame={setNewGame}
            handleAddGame={handleAddGame}
            allStatuses={allStatuses}
            allMyGenres={allMyGenres}
            onClose={() => setShowAddForm(false)}
          />
        )}

        {/* Main content */}
        {displayGames.length ? (
          <GameGrid
            games={displayGames}
            onSelectGame={setSelectedGame}
            onEditGame={startEditing}
            onDeleteGame={handleDeleteGame}
            onReorder={isAuthenticated ? handleReorderGames : null}
          />
        ) : (
          <div className="text-center py-10 text-content-muted">
            {searchQuery ||
            selectedStatuses.length ||
            selectedGenres.length ||
            selectedMyGenres.length
              ? "No games match your filters."
              : "No games yet. Add your first game!"}
          </div>
        )}

        {/* Modals */}
        {selectedGame && (
          <GameModal
            game={selectedGame}
            onClose={() => setSelectedGame(null)}
          />
        )}

        {surpriseGame && (
          <GameModal
            game={surpriseGame}
            onClose={() => setSurpriseGame(null)}
            onRefresh={handleSurpriseMe}
          />
        )}

        {editingGame && (
          <EditGameForm
            game={editingGame}
            onSubmit={handleEditGame}
            onCancel={() => setEditingGame(null)}
            statuses={allStatuses}
          />
        )}

        {showAdminLogin && (
          <AdminLoginForm onClose={() => setShowAdminLogin(false)} />
        )}

        {showPublicSettings && (
          <PublicSettingsModal
            open={showPublicSettings}
            onClose={() => setShowPublicSettings(false)}
          />
        )}
      </main>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/u/:username" element={<PublicProfile />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;
