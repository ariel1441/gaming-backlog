import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = ({
  sidebarOpen,
  setSidebarOpen,
  searchQuery,
  setSearchQuery,
  filterVisible,
  setFilterVisible,
  showAddForm,
  setShowAddForm,
  handleSurpriseMe,
  sortKey,
  setSortKey,
  isReversed,
  setIsReversed,
  onShowAdminLogin,
}) => {
  const { isAdmin, logout } = useAuth();

  const handleLogout = () => {
    logout();
    // Optional: Show a success message
    console.log('Logged out successfully');
  };

  return (
    <aside
      className={`
        transition-all duration-300 bg-gray-800 flex flex-col items-center
        p-4 space-y-4
        ${sidebarOpen ? 'w-[20vw] min-w-[150px] max-w-64' : 'w-16'}
      `}
    >
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`mt-4 ${
          sidebarOpen
            ? 'text-left w-full bg-gray-700 px-3 py-2 rounded hover:bg-purple-600'
            : 'bg-gray-700 w-10 h-10 flex items-center justify-center rounded hover:bg-purple-600'
        }`}
      >
        ☰ {sidebarOpen && 'Menu'}
      </button>

      {sidebarOpen && (
        <>
          <h1 className="text-xl font-bold text-center">Game Backlog 🎮</h1>

          {/* Admin Status Indicator */}
          {isAdmin && (
            <div className="w-full bg-purple-900 border border-purple-600 px-3 py-2 rounded text-center text-sm">
              <div className="text-purple-300">👑 Admin Mode</div>
            </div>
          )}

          {/* Admin Login/Logout Button */}
          <div className="w-full">
            {isAdmin ? (
              <button
                onClick={handleLogout}
                className="w-full bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-white font-medium transition-colors"
              >
                🚪 Logout
              </button>
            ) : (
              <button
                onClick={onShowAdminLogin}
                className="w-full bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded text-white font-medium transition-colors"
              >
                🔑 Admin Login
              </button>
            )}
          </div>

          <input
            className="bg-gray-700 text-white px-3 py-2 rounded w-full"
            placeholder="Search games..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <button
            onClick={() => setFilterVisible(!filterVisible)}
            className="w-full bg-gray-700 px-3 py-2 rounded hover:bg-purple-600"
          >
            {filterVisible ? 'Hide Filters' : 'Show Filters'}
          </button>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full bg-gray-700 px-3 py-2 rounded hover:bg-purple-600"
          >
            {showAddForm ? 'Cancel' : 'Add Game'}
          </button>

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
              const descendingByDefault = ['hoursPlayed', 'rawgRating', 'metacritic'];
              setIsReversed(descendingByDefault.includes(key));
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
            onClick={() => sortKey && setIsReversed((prev) => !prev)}
            className="w-full bg-gray-600 px-3 py-2 rounded hover:bg-purple-600"
            disabled={!sortKey}
          >
            Reverse Sort ⇅
          </button>

          {/* Admin Helper Text */}
          {!isAdmin && (
            <div className="w-full text-xs text-gray-400 text-center mt-4 px-2">
              <p>💡 Anyone can add games!</p>
              <p>Login as admin to edit/delete.</p>
            </div>
          )}
        </>
      )}
    </aside>
  );
};

export default Sidebar;