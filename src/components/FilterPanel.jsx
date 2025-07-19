import React from 'react';

/**
 * Filter panel with selectable tags for status, genre, and my genre.
 */
const FilterPanel = ({
  allStatuses,
  allGenres,
  allMyGenres,
  selectedStatuses,
  selectedGenres,
  selectedMyGenres,
  handleCheckboxToggle,
  setSelectedStatuses,
  setSelectedGenres,
  setSelectedMyGenres,
  resetFilters,
  filterRef,
}) => (
  <div ref={filterRef} className="bg-gray-800 p-4 rounded mb-6 relative">
    <button
      onClick={resetFilters}
      className="absolute top-2 right-2 text-xs bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-1 rounded-full shadow-md transition duration-200"
    >
      Reset Filters
    </button>

    <h3 className="font-semibold mb-2">Filter by Status</h3>
    <div className="flex flex-wrap gap-2 mb-4">
      {allStatuses.map((status) => (
        <FilterTag
          key={status}
          label={status}
          selected={selectedStatuses.includes(status)}
          onToggle={() => handleCheckboxToggle(status, selectedStatuses, setSelectedStatuses)}
        />
      ))}
    </div>

    <h3 className="font-semibold mb-2">Filter by Genre</h3>
    <div className="flex flex-wrap gap-2 mb-4">
      {allGenres.map((genre) => (
        <FilterTag
          key={genre}
          label={genre}
          selected={selectedGenres.includes(genre)}
          onToggle={() => handleCheckboxToggle(genre, selectedGenres, setSelectedGenres)}
        />
      ))}
    </div>

    <h3 className="font-semibold mb-2">Filter by My Genre</h3>
    <div className="flex flex-wrap gap-2">
      {allMyGenres.map((genre) => (
        <FilterTag
          key={genre}
          label={genre}
          selected={selectedMyGenres.includes(genre)}
          onToggle={() => handleCheckboxToggle(genre, selectedMyGenres, setSelectedMyGenres)}
        />
      ))}
    </div>
  </div>
);

/**
 * Single selectable filter tag.
 */
const FilterTag = ({ label, selected, onToggle }) => (
  <label
    onClick={onToggle}
    className={`px-3 py-1 rounded cursor-pointer transition ${
      selected
        ? 'bg-purple-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`}
  >
    {label}
  </label>
);

export default FilterPanel;
