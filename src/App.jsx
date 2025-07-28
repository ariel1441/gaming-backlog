import React, { useEffect, useState, useRef } from 'react';
import Sidebar from './components/Sidebar';
import FilterPanel from './components/FilterPanel';
import AddGameForm from './components/AddGameForm';
import GameGrid from './components/GameGrid';
import GameModal from './components/GameModal';
import EditGameForm from './components/EditGameForm'; // New import

const App = () => {
  const [games, setGames] = useState([]);
  const [filteredGames, setFilteredGames] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState(null);
  const [surpriseGame, setSurpriseGame] = useState(null);

  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedMyGenres, setSelectedMyGenres] = useState([]);

  const [filterVisible, setFilterVisible] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [sortKey, setSortKey] = useState('');
  const [isReversed, setIsReversed] = useState(false);

  const [newGame, setNewGame] = useState({
    name: '', status: '', how_long_to_beat: '', my_genre: '', thoughts: '', my_score: '',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New state for editing
  const [editingGame, setEditingGame] = useState(null);

  const filterRef = useRef(null);
  const addFormRef = useRef(null);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:5000/api/games');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      const normalized = data.map(game => ({ ...game, rawgRating: game.rating || 0 }));
      setGames(normalized);
      setFilteredGames(normalized);
    } catch (err) {
      console.error('Failed to fetch games:', err);
      setError('Failed to load games. Please try again.');
      setGames([]);
      setFilteredGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const filtered = games.filter(g => {
      const lower = searchQuery.toLowerCase();
      const nameMatch = g.name?.toLowerCase().includes(lower);
      const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(g.status);
      const genreMatch = selectedGenres.length === 0 || selectedGenres.some(genre =>
        g.genres?.split(',').map(x => x.trim()).includes(genre)
      );
      const myGenreMatch = selectedMyGenres.length === 0 || selectedMyGenres.some(tag =>
        g.my_genre?.toLowerCase().split(',').map(x => x.trim()).includes(tag.toLowerCase())
      );
      return nameMatch && statusMatch && genreMatch && myGenreMatch;
    });

    if (sortKey) {
      filtered.sort((a, b) => {
        let compare = 0;
        switch (sortKey) {
          case 'name': compare = (a.name || '').localeCompare(b.name || ''); break;
          case 'hoursPlayed': compare = (Number(a.hoursPlayed) || 0) - (Number(b.hoursPlayed) || 0); break;
          case 'rawgRating': compare = (Number(a.rawgRating) || 0) - (Number(b.rawgRating) || 0); break;
          case 'metacritic': compare = (Number(a.metacritic) || 0) - (Number(b.metacritic) || 0); break;
          case 'releaseDate':
            const dateA = new Date(a.releaseDate || a.released || 0);
            const dateB = new Date(b.releaseDate || b.released || 0);
            compare = dateA - dateB;
            break;
          default: compare = 0;
        }
        return isReversed ? -compare : compare;
      });
    }

    setFilteredGames(filtered);
  }, [searchQuery, selectedGenres, selectedStatuses, selectedMyGenres, games, sortKey, isReversed]);

  useEffect(() => {
    if (filterVisible && filterRef.current) {
      filterRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filterVisible]);

  useEffect(() => {
    if (showAddForm && addFormRef.current) {
      addFormRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [showAddForm]);

  const allGenres = [...new Set(games.flatMap(g => g.genres?.split(',').map(x => x.trim()).filter(Boolean)))].sort();
  const allMyGenres = [...new Set(games.flatMap(g => g.my_genre?.split(',').map(x => x.trim()).filter(Boolean)))].sort();
  const allStatuses = [...new Set(games.map(g => g.status).filter(Boolean))].sort();

  const handleCheckboxToggle = (value, list, setList) => {
    setList(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
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
      setNewGame({ name: '', status: '', how_long_to_beat: '', my_genre: '', thoughts: '', my_score: '' });
      setShowAddForm(false);
      fetchGames();
    } catch (err) {
      console.error('Error adding game:', err);
    }
  };

  // New function for editing games
  const handleEditGame = async (gameData) => {
    try {
      const response = await fetch(`http://localhost:5000/api/games/${gameData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gameData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Update failed with status ${response.status}:`, errorText);
        alert(`Update failed: ${errorText}`);
        return;
      }

      const updatedGame = await response.json();
      
      // Update the games list with the edited game
      setGames(prevGames => 
        prevGames.map(game => 
          game.id === updatedGame.id ? { ...game, ...updatedGame } : game
        )
      );

      // Close edit mode
      setEditingGame(null);
      
      console.log('Game updated successfully:', updatedGame);
    } catch (error) {
      console.error('Error updating game:', error);
      alert('Failed to update game. Please try again.');
    }
  };

  // New function for deleting games
  const handleDeleteGame = async (gameId) => {
    if (!confirm('Are you sure you want to delete this game?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/games/${gameId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete game');
      }

      // Remove the game from the list
      setGames(prevGames => prevGames.filter(game => game.id !== gameId));
      
      console.log('Game deleted successfully');
    } catch (error) {
      console.error('Error deleting game:', error);
      alert('Failed to delete game. Please try again.');
    }
  };

  // New function to start editing
  const startEditing = (game) => {
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

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterVisible={filterVisible}
        setFilterVisible={setFilterVisible}
        showAddForm={showAddForm}
        setShowAddForm={setShowAddForm}
        handleSurpriseMe={handleSurpriseMe}
        sortKey={sortKey}
        setSortKey={setSortKey}
        isReversed={isReversed}
        setIsReversed={setIsReversed}
      />

      <main className="flex-1 p-6 overflow-auto">
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
          />
        )}

        {loading ? (
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-purple-500"></div>
          </div>
        ) : error ? (
          <div className="text-center py-10 text-red-400">{error}</div>
        ) : (
          <GameGrid
            games={filteredGames}
            onSelectGame={setSelectedGame}
            onEditGame={startEditing}
            onDeleteGame={handleDeleteGame}
          />
        )}

        {selectedGame && (
          <GameModal game={selectedGame} onClose={() => setSelectedGame(null)} />
        )}

        {surpriseGame && (
          <GameModal
            game={surpriseGame}
            onClose={() => setSurpriseGame(null)}
            onRefresh={handleSurpriseMe}
          />
        )}

        {/* New EditGameForm modal */}
        {editingGame && (
          <EditGameForm
            game={editingGame}
            onSubmit={handleEditGame}
            onCancel={() => setEditingGame(null)}
            statuses={allStatuses}
          />
        )}
      </main>
    </div>
  );
};

export default App;