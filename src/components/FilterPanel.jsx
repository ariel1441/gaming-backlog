import React from 'react';
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
  <div ref={filterRef} className="bg-surface-card p-4 rounded mb-6 relative border border-surface-border">
    <button
      onClick={resetFilters}
      className="absolute top-2 right-2 text-xs bg-action-danger hover:bg-action-danger-hover text-content-primary font-semibold px-3 py-1 rounded-full shadow-md transition duration-200"
    >
      Reset Filters
    </button>

    <h3 className="font-semibold mb-2 text-content-primary">Filter by Status</h3>
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

    <h3 className="font-semibold mb-2 text-content-primary">Filter by Genre</h3>
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

    <h3 className="font-semibold mb-2 text-content-primary">Filter by My Genre</h3>
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
const FilterTag = ({ label, selected, onToggle }) => (
  <label
    onClick={onToggle}
    className={`px-3 py-1 rounded cursor-pointer transition ${
      selected
        ? 'bg-action-primary hover:bg-action-primary-hover text-content-primary'
        : 'bg-surface-elevated hover:bg-surface-border text-content-muted hover:text-content-secondary'
    }`}
  >
    {label}
  </label>
);


export default FilterPanel;