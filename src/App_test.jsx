import React, { useEffect, useState, useRef } from 'react';
import GameCard from './components/GameCard';
import GameModal from './components/GameModal';

const App = () => {
  const [games, setGames] = useState([]);
  const [filteredGames, setFilteredGames] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState(null);

  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedMyGenres, setSelectedMyGenres] = useState([]);
  const [filterVisible, setFilterVisible] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [newGame, setNewGame] = useState({
    name: '',
    status: '',
    hoursPlayed: '',
    my_genre: '',
    genres: '',
    toughts: '',
    status_rank: '',
    my_score: '',
  });

  const [sortKey, setSortKey] = useState('');
  const [isReversed, setIsReversed] = useState(false);

  const filterRef = useRef(null);
  const addFormRef = useRef(null);

  // *** Added surpriseGame state ***
  const [surpriseGame, setSurpriseGame] = useState(null);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/games');
      const data = await res.json();
      const normalizedData = data.map(game => ({
        ...game,
        rawgRating: game.rating || 0,
      }));
      setGames(normalizedData);
      setFilteredGames(normalizedData);
    } catch (err) {
      console.error('Failed to fetch games:', err);
    }
  };

  useEffect(() => {
    const lowerSearch = searchQuery.toLowerCase();

    let filtered = games.filter((g) => {
      const nameMatch = g.name?.toLowerCase().includes(lowerSearch);
      const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(g.status);
      const genreMatch =
        selectedGenres.length === 0 ||
        selectedGenres.some((genre) => g.genres?.split(',').map(x => x.trim()).includes(genre));
      const myGenreMatch =
        selectedMyGenres.length === 0 ||
        selectedMyGenres.some((tag) =>
          g.my_genre?.toLowerCase().split(',').map(x => x.trim()).includes(tag.toLowerCase())
        );
      return nameMatch && statusMatch && genreMatch && myGenreMatch;
    });

    if (sortKey) {
      filtered = [...filtered].sort((a, b) => {
        let compare = 0;
        switch (sortKey) {
          case 'name':
            compare = (a.name || '').localeCompare(b.name || '');
            break;
          case 'hoursPlayed':
            compare = (Number(a.hoursPlayed) || 0) - (Number(b.hoursPlayed) || 0);
            break;
          case 'rawgRating':
            compare = (Number(a.rawgRating) || 0) - (Number(b.rawgRating) || 0);
            break;
          case 'metacritic':
            compare = (Number(a.metacritic) || 0) - (Number(b.metacritic) || 0);
            break;
          case 'releaseDate':
            const dateA = a.releaseDate ? new Date(a.releaseDate) : a.released ? new Date(a.released) : new Date(0);
            const dateB = b.releaseDate ? new Date(b.releaseDate) : b.released ? new Date(b.released) : new Date(0);
            compare = dateA - dateB;
            break;
          default:
            compare = 0;
        }
        return isReversed ? -compare : compare;
      });
    }

    setFilteredGames(filtered);
  }, [searchQuery, selectedGenres, selectedStatuses, selectedMyGenres, games, sortKey, isReversed]);

  useEffect(() => {
    if (filterVisible && filterRef.current) {
      filterRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filterVisible]);

  useEffect(() => {
    if (showAddForm && addFormRef.current) {
      addFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showAddForm]);

  const allGenres = Array.from(
    new Set(games.flatMap(g => g.genres?.split(',').map(x => x.trim()).filter(Boolean)))
  ).sort();

  const allMyGenres = Array.from(
    new Set(games.flatMap(g => g.my_genre?.split(',').map(x => x.trim()).filter(Boolean)))
  ).sort();

  const allStatuses = Array.from(new Set(games.map(g => g.status).filter(Boolean))).sort();

  const handleCheckboxToggle = (value, list, setList) => {
    setList((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // New handlers for selectable tags instead of checkboxes
  const toggleStatus = (status) => {
    handleCheckboxToggle(status, selectedStatuses, setSelectedStatuses);
  };

  const toggleGenre = (genre) => {
    handleCheckboxToggle(genre, selectedGenres, setSelectedGenres);
  };

  const toggleMyGenre = (genre) => {
    handleCheckboxToggle(genre, selectedMyGenres, setSelectedMyGenres);
  };

  // Reset all filters
  const resetFilters = () => {
    setSelectedStatuses([]);
    setSelectedGenres([]);
    setSelectedMyGenres([]);
    setSearchQuery('');
  };

  const handleAddGame = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:5000/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGame),
      });
      if (!res.ok) throw new Error('Failed to add game');
      await res.json();
      setNewGame({
        name: '', status: '', hoursPlayed: '', my_genre: '', genres: '', toughts: '', status_rank: '', my_score: '',
      });
      setShowAddForm(false);
      fetchGames();
    } catch (err) {
      console.error('❌ Error adding game:', err);
    }
  };

  // *** Added function to pick a random game ***
  const handleSurpriseMe = () => {
    if (games.length === 0) return;
    const random = games[Math.floor(Math.random() * games.length)];
    setSurpriseGame(random);
  };

  // *** Added function to refresh surprise game ***
  const handleRefreshSurprise = () => {
    handleSurpriseMe();
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      <aside className={`${sidebarOpen ? 'w-64 p-4 space-y-4' : 'w-16'} transition-all duration-300 bg-gray-800 flex flex-col items-center`}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`mt-4 ${sidebarOpen
            ? 'text-left w-full bg-gray-700 px-3 py-2 rounded hover:bg-purple-600'
            : 'bg-gray-700 w-10 h-10 flex items-center justify-center rounded hover:bg-purple-600'
          }`}
        >
          ☰ {sidebarOpen && 'Menu'}
        </button>
        {/* your filters go here */}

        {sidebarOpen && (
          <>
            <h1 className="text-xl font-bold">Game Backlog 🎮</h1>
            <input
              className="bg-gray-700 text-white px-3 py-2 rounded w-full"
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button onClick={() => setFilterVisible(!filterVisible)} className="w-full bg-gray-700 rounded px-3 py-2 hover:bg-purple-600">
              {filterVisible ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button onClick={() => setShowAddForm(!showAddForm)} className="w-full bg-gray-700 px-3 py-2 rounded hover:bg-purple-600">
              {showAddForm ? 'Cancel' : 'Add Game'}
            </button>

            {/* *** Added Surprise Me button *** */}
            <button
              onClick={handleSurpriseMe}
              className="w-full bg-gray-700 px-3 py-2 rounded hover:bg-purple-600"
            >
               Surprise Me 🎲
            </button>

            <select
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
              value={sortKey}
              onChange={(e) => {
                const key = e.target.value;
                setSortKey(key);
                const defaultDescending = ['hoursPlayed', 'rawgRating', 'metacritic'];
                setIsReversed(defaultDescending.includes(key));
              }}
            >
              <option value="">Sort By</option>
              <option value="name">Name</option>
              <option value="hoursPlayed">How Long To Beat</option>
              <option value="rawgRating">RAWG Rating</option>
              <option value="metacritic">Metacritic</option>
              <option value="releaseDate">Release Date</option>
            </select>
            <button
              onClick={() => sortKey && setIsReversed(prev => !prev)}
              className="w-full bg-gray-600 px-3 py-2 rounded hover:bg-purple-600"
            >
               Reverse Sort ⇅
            </button>
          </>
        )}
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        {filterVisible && (
          <div ref={filterRef} className="bg-gray-800 p-4 rounded mb-6 relative">
            {/* Reset Filters button top right */}
            <button
              onClick={resetFilters}
              className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
              title="Reset all filters"
            >
              Reset Filters
            </button>

            <h3 className="font-semibold mb-2">Filter by Status</h3>
            <div className="flex flex-wrap gap-2">
              {allStatuses.map((status, i) => (
                <button
                  key={i}
                  onClick={() => toggleStatus(status)}
                  className={`px-3 py-1 rounded cursor-pointer select-none transition-colors
                    ${
                      selectedStatuses.includes(status)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-purple-500 hover:text-white'
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <h3 className="font-semibold mt-4 mb-2">Filter by Genre</h3>
            <div className="flex flex-wrap gap-2">
              {allGenres.map((genre, i) => (
                <button
                  key={i}
                  onClick={() => toggleGenre(genre)}
                  className={`px-3 py-1 rounded cursor-pointer select-none transition-colors
                    ${
                      selectedGenres.includes(genre)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-purple-500 hover:text-white'
                    }`}
                >
                  {genre}
                </button>
              ))}
            </div>

            <h3 className="font-semibold mt-4 mb-2">Filter by My Genre</h3>
            <div className="flex flex-wrap gap-2">
              {allMyGenres.map((genre, i) => (
                <button
                  key={i}
                  onClick={() => toggleMyGenre(genre)}
                  className={`px-3 py-1 rounded cursor-pointer select-none transition-colors
                    ${
                      selectedMyGenres.includes(genre)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-purple-500 hover:text-white'
                    }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
        )}

        {showAddForm && (
          <form ref={addFormRef} onSubmit={handleAddGame} className="bg-gray-800 p-6 rounded space-y-4 mb-6">
            <h2 className="text-lg font-bold mb-4">Add New Game</h2>

            <input
              type="text"
              placeholder="Name"
              value={newGame.name}
              onChange={(e) => setNewGame({ ...newGame, name: e.target.value })}
              required
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
            />
            <input
              type="text"
              placeholder="Status"
              value={newGame.status}
              onChange={(e) => setNewGame({ ...newGame, status: e.target.value })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
            />
            <input
              type="number"
              placeholder="Hours Played"
              value={newGame.hoursPlayed}
              onChange={(e) => setNewGame({ ...newGame, hoursPlayed: e.target.value })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
            />
            <input
              type="text"
              placeholder="My Genre"
              value={newGame.my_genre}
              onChange={(e) => setNewGame({ ...newGame, my_genre: e.target.value })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
            />
            <input
              type="text"
              placeholder="Genres"
              value={newGame.genres}
              onChange={(e) => setNewGame({ ...newGame, genres: e.target.value })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
            />
            <textarea
              placeholder="Thoughts"
              value={newGame.toughts}
              onChange={(e) => setNewGame({ ...newGame, toughts: e.target.value })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
              rows={3}
            />
            <input
              type="number"
              placeholder="Status Rank"
              value={newGame.status_rank}
              onChange={(e) => setNewGame({ ...newGame, status_rank: e.target.value })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
            />
            <input
              type="number"
              placeholder="My Score"
              value={newGame.my_score}
              onChange={(e) => setNewGame({ ...newGame, my_score: e.target.value })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
            />

            <button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded"
            >
              Add Game
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredGames.map((game) => (
            <GameCard
              key={game.id || game.name}
              game={game}
              onClick={() => setSelectedGame(game)}
            />
          ))}
        </div>

        {(selectedGame || surpriseGame) && (
          <GameModal
            game={selectedGame || surpriseGame}
            onClose={() => {
              setSelectedGame(null);
              setSurpriseGame(null);
            }}
            // Added surprise refresh button only if surpriseGame is shown
            extraActions={
              surpriseGame
                ? (
                  <button
                    onClick={handleRefreshSurprise}
                    className="mt-2 bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm"
                  >
                    Show Another Surprise
                  </button>
                )
                : null
            }
          />
        )}
      </main>
    </div>
  );
};

export default App;
