import React, { useEffect, useState, useRef } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./contexts/AuthContext";
import Sidebar from "./components/Sidebar";
import FilterPanel from "./components/FilterPanel";
import AddGameForm from "./components/AddGameForm";
import GameGrid from "./components/GameGrid";
import GameModal from "./components/GameModal";
import EditGameForm from "./components/EditGameForm";
import AdminLoginForm from "./components/AdminLoginForm";

const AppContent = () => {
  const [games, setGames] = useState([]);
  const [filteredGames, setFilteredGames] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
  const [surpriseGame, setSurpriseGame] = useState(null);

  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedMyGenres, setSelectedMyGenres] = useState([]);

  const [filterVisible, setFilterVisible] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const [sortKey, setSortKey] = useState("");
  const [isReversed, setIsReversed] = useState(false);

  const [newGame, setNewGame] = useState({
    name: "",
    status: "",
    how_long_to_beat: "",
    my_genre: "",
    thoughts: "",
    my_score: "",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingGame, setEditingGame] = useState(null);

  // CHANGED: pull user/isAuthenticated + keep getAuthHeaders and authLoading
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    getAuthHeaders,
  } = useAuth(); // CHANGED

  const filterRef = useRef(null);
  const addFormRef = useRef(null);
  const searchRef = useRef(null);
  const sortRef = useRef(null);

  useEffect(() => {
    // CHANGED: only fetch when logged-in is known AND authenticated
    if (!authLoading && isAuthenticated) {
      fetchGames();
    }
    // If not authenticated, clear lists and stop loading
    if (!authLoading && !isAuthenticated) {
      setGames([]);
      setFilteredGames([]);
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]); // CHANGED

  const fetchGames = async () => {
    setLoading(true);
    setError(null);

    try {
      // CHANGED: include auth header
      const res = await fetch("http://localhost:5000/api/games", {
        headers: {
          ...getAuthHeaders(), // CHANGED
        },
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      const normalized = data.map((game) => ({
        ...game,
        rawgRating: game.rating || 0,
      }));
      setGames(normalized);
      setFilteredGames(normalized);
    } catch (err) {
      console.error("Failed to fetch games:", err);
      setError("Failed to load games. Please try again.");
      setGames([]);
      setFilteredGames([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReorderGames = async (gameId, targetIndex, status) => {
    console.log(
      `🎯 REORDER REQUEST: Game ${gameId} → Index ${targetIndex} in status "${status}"`
    );

    try {
      const response = await fetch(
        `http://localhost:5000/api/games/${gameId}/position`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            targetIndex: targetIndex,
            status: status,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log(`✅ Backend confirmed reorder for game ${gameId}`);

      const freshGamesResponse = await fetch(
        "http://localhost:5000/api/games",
        {
          headers: {
            ...getAuthHeaders(), // CHANGED
          },
        }
      );
      if (!freshGamesResponse.ok) {
        throw new Error("Failed to fetch updated games");
      }

      const freshGamesData = await freshGamesResponse.json();
      const normalizedData = freshGamesData.map((game) => ({
        ...game,
        rawgRating: game.rating || 0,
      }));

      setGames(normalizedData);

      console.log(`✅ SUCCESS: UI updated with fresh game positions`);
    } catch (err) {
      console.error("❌ FAILED to reorder game:", err);
      fetchGames();
      alert("Failed to reorder game. Please try again.");
    }
  };

  // Updated filtering and sorting (unchanged)
  useEffect(() => {
    const filtered = games.filter((g) => {
      const lower = searchQuery.toLowerCase();
      const nameMatch = g.name?.toLowerCase().includes(lower);
      const statusMatch =
        selectedStatuses.length === 0 || selectedStatuses.includes(g.status);
      const genreMatch =
        selectedGenres.length === 0 ||
        selectedGenres.some((genre) =>
          g.genres
            ?.split(",")
            .map((x) => x.trim())
            .includes(genre)
        );
      const myGenreMatch =
        selectedMyGenres.length === 0 ||
        selectedMyGenres.some((tag) =>
          g.my_genre
            ?.toLowerCase()
            .split(",")
            .map((x) => x.trim())
            .includes(tag.toLowerCase())
        );
      return nameMatch && statusMatch && genreMatch && myGenreMatch;
    });

    filtered.sort((a, b) => {
      const statusCompare = (a.status_rank || 999) - (b.status_rank || 999);
      if (statusCompare !== 0) return statusCompare;

      const posA = a.position || 999999;
      const posB = b.position || 999999;
      const positionCompare = posA - posB;
      if (positionCompare !== 0) return positionCompare;

      return a.id - b.id;
    });

    if (sortKey) {
      filtered.sort((a, b) => {
        let compare = 0;
        switch (sortKey) {
          case "name":
            compare = (a.name || "").localeCompare(b.name || "");
            break;
          case "hoursPlayed":
            compare =
              (Number(a.how_long_to_beat) || 0) -
              (Number(b.how_long_to_beat) || 0);
            break;
          case "rawgRating":
            compare = (Number(a.rawgRating) || 0) - (Number(b.rawgRating) || 0);
            break;
          case "metacritic":
            compare = (Number(a.metacritic) || 0) - (Number(b.metacritic) || 0);
            break;
          case "releaseDate":
            const dateA = new Date(a.releaseDate || a.released || 0);
            const dateB = new Date(b.releaseDate || b.released || 0);
            compare = dateA - dateB;
            break;
          default:
            compare = 0;
        }
        return isReversed ? -compare : compare;
      });
    }

    setFilteredGames(filtered);
  }, [
    searchQuery,
    selectedGenres,
    selectedStatuses,
    selectedMyGenres,
    games,
    sortKey,
    isReversed,
  ]);

  useEffect(() => {
    if (filterVisible && filterRef.current) {
      filterRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filterVisible]);

  useEffect(() => {
    if (showAddForm && addFormRef.current) {
      addFormRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [showAddForm]);

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

  const allGenres = [
    ...new Set(
      games.flatMap((g) =>
        g.genres
          ?.split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      )
    ),
  ].sort();
  const allMyGenres = [
    ...new Set(
      games.flatMap((g) =>
        g.my_genre
          ?.split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      )
    ),
  ].sort();
  const allStatuses = [
    ...new Set(games.map((g) => g.status).filter(Boolean)),
  ].sort();

  const handleCheckboxToggle = (value, list, setList) => {
    setList((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleAddGame = async (e) => {
    e.preventDefault();
    try {
      const headers = {
        "Content-Type": "application/json",
        ...getAuthHeaders(), // CHANGED
      };

      const res = await fetch("http://localhost:5000/api/games", {
        method: "POST",
        headers,
        body: JSON.stringify(newGame),
      });

      if (!res.ok) throw new Error("Failed to add game");

      const addedGame = await res.json();

      // CHANGED: removed old non-admin status override alert (not relevant in multi-user)

      setNewGame({
        name: "",
        status: "",
        how_long_to_beat: "",
        my_genre: "",
        thoughts: "",
        my_score: "",
      });
      setShowAddForm(false);
      fetchGames();
    } catch (err) {
      console.error("Error adding game:", err);
      alert("Failed to add game. Please try again.");
    }
  };

  const handleEditGame = async (gameData) => {
    // CHANGED: was admin-only; now just require login
    if (!isAuthenticated) {
      alert("Login required to edit games.");
      return;
    }

    try {
      const headers = {
        "Content-Type": "application/json",
        ...getAuthHeaders(), // CHANGED
      };

      const response = await fetch(
        `http://localhost:5000/api/games/${gameData.id}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify(gameData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error(
          `Update failed with status ${response.status}:`,
          errorData
        );
        alert(
          `Update failed: ${errorData.error || errorData.message || "Unknown error"}`
        );
        return;
      }

      const updatedGame = await response.json();

      setGames((prevGames) =>
        prevGames.map((game) =>
          game.id === updatedGame.id ? { ...game, ...updatedGame } : game
        )
      );

      setEditingGame(null);
      console.log("Game updated successfully:", updatedGame);
    } catch (error) {
      console.error("Error updating game:", error);
      alert("Failed to update game. Please try again.");
    }
  };

  const handleDeleteGame = async (gameId) => {
    // CHANGED: was admin-only; now just require login
    if (!isAuthenticated) {
      alert("Login required to delete games.");
      return;
    }

    if (!confirm("Are you sure you want to delete this game?")) {
      return;
    }

    try {
      const headers = {
        ...getAuthHeaders(), // CHANGED
      };

      const response = await fetch(
        `http://localhost:5000/api/games/${gameId}`,
        {
          method: "DELETE",
          headers,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete game");
      }

      setGames((prevGames) => prevGames.filter((game) => game.id !== gameId));
      console.log("Game deleted successfully");
    } catch (error) {
      console.error("Error deleting game:", error);
      alert("Failed to delete game. Please try again.");
    }
  };

  const startEditing = (game) => {
    // CHANGED: was admin-only; now just require login
    if (!isAuthenticated) {
      alert("Login required to edit games.");
      return;
    }
    setEditingGame(game);
  };

  const handleSurpriseMe = () => {
    if (games.length > 0) {
      setSurpriseGame(games[Math.floor(Math.random() * games.length)]);
    }
  };

  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedGenres([]);
    setSelectedMyGenres([]);
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  const clearSort = () => {
    setSortKey("");
    setIsReversed(false);
  };

  if (authLoading) {
    return (
      <div className="flex h-screen bg-surface-bg text-content-primary items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-primary"></div>
      </div>
    );
  }

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
        // CHANGED: old "admin login" button likely needs replacing later with Login/Register UI
        onShowAdminLogin={() => setShowAdminLogin(true)}
      />

      <main className="flex-1 p-6 overflow-auto">
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

        {showAddForm && (
          <AddGameForm
            addFormRef={addFormRef}
            newGame={newGame}
            setNewGame={setNewGame}
            handleAddGame={handleAddGame}
            allStatuses={allStatuses}
            allMyGenres={allMyGenres}
            isAdmin={isAuthenticated} // CHANGED: allow user to pick status
          />
        )}

        {loading ? (
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-primary"></div>
          </div>
        ) : error ? (
          <div className="text-center py-10 text-state-error">{error}</div>
        ) : (
          <GameGrid
            games={filteredGames}
            onSelectGame={setSelectedGame}
            onEditGame={startEditing}
            onDeleteGame={handleDeleteGame}
            isAdmin={isAuthenticated} // CHANGED: components still expect prop name "isAdmin"
            onReorder={isAuthenticated ? handleReorderGames : null} // CHANGED
          />
        )}

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
      </main>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
