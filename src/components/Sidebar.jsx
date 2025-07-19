import React from 'react';

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
}) => {
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
          >
            Reverse Sort ⇅
          </button>
        </>
      )}
    </aside>
  );
};

export default Sidebar;
