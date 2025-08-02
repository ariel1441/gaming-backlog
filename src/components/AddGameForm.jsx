import React, { useState, useEffect } from 'react';
import Select from 'react-select';

const AddGameForm = ({
  addFormRef,
  newGame,
  setNewGame,
  handleAddGame,
  allMyGenres = [],
  allStatuses = [],
  isAdmin,
}) => {
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isAdmin) {
      setNewGame((prev) => ({
        ...prev,
        status: 'recommended by someone',
      }));
    }
  }, [isAdmin]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewGame((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const newErrors = {};
    if (!newGame.name.trim()) newErrors.name = 'Name is required.';
    if (isAdmin && !newGame.status.trim()) newErrors.status = 'Status is required.';
    if (newGame.how_long_to_beat && isNaN(newGame.how_long_to_beat)) {
      newErrors.how_long_to_beat = 'How long to beat must be a number.';
    }
    return newErrors;
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    handleAddGame(e);
  };

  const statusOptions = allStatuses.map(status => ({
    label: status,
    value: status
  }));
  const selectedStatus = newGame.status
    ? { label: newGame.status, value: newGame.status }
    : null;
  const handleStatusSelect = (selected) => {
    setNewGame((prev) => ({ ...prev, status: selected?.value || '' }));
  };

  const genreOptions = allMyGenres.map(tag => ({
    label: tag,
    value: tag
  }));
  const selectedGenres = newGame.my_genre
    ? newGame.my_genre.split(',').map(tag => ({ label: tag.trim(), value: tag.trim() }))
    : [];
  const handleGenreSelect = (selected) => {
    const joined = selected ? selected.map(option => option.value).join(', ') : '';
    setNewGame((prev) => ({ ...prev, my_genre: joined }));
  };

 const customStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: '#374151', // surface.elevated
    borderColor: state.isFocused ? '#f97316' : '#4b5563', // primary OR surface.border
    color: '#f9fafb', // content.primary
    minHeight: '38px',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(249, 115, 22, 0.5)' : 'none', // primary glow
    transition: 'all 0.2s ease',
    '&:hover': {
      borderColor: '#f97316', // primary
    },
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#374151', // surface.elevated
    border: '1px solid #4b5563',
    zIndex: 10,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? '#f97316' // primary
      : state.isFocused
      ? '#fb923c' // primary.light
      : '#374151', // surface.elevated
    color: '#f9fafb', // content.primary
    cursor: 'pointer',
    '&:active': {
      backgroundColor: '#f97316',
    },
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: '#f97316', // primary
    color: '#f9fafb',
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: '#f9fafb',
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: '#f9fafb',
    ':hover': {
      backgroundColor: '#fb923c', // primary.light
      color: '#ffffff',
    },
  }),
  singleValue: (base) => ({
    ...base,
    color: '#f9fafb',
  }),
  input: (base) => ({
    ...base,
    color: '#f9fafb',
  }),
};

  return (
    <form
      ref={addFormRef}
      onSubmit={onSubmit}
      className="bg-surface-card border border-surface-border p-4 rounded mb-6"
    >
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold text-content-primary">Add a New Game</h2>
        {!isAdmin && (
          <span className="text-xs text-state-warning bg-state-warning/20 px-2 py-1 rounded border border-state-warning">
            ⚠️ Status will be set to "recommended by someone"
          </span>
        )}
      </div>

      {Object.values(errors).length > 0 && (
        <div className="bg-state-error/20 text-state-error border border-state-error p-2 rounded mb-3">
          <ul className="list-disc pl-5">
            {Object.values(errors).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 items-start">
        <input
          name="name"
          type="text"
          placeholder="Name"
          value={newGame.name}
          onChange={handleChange}
          required
          className="bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted px-2 py-2 rounded w-full h-[38px] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />

        <div className="relative">
          <Select
            options={statusOptions}
            value={selectedStatus}
            onChange={handleStatusSelect}
            styles={customStyles}
            placeholder="Select status..."
            isDisabled={!isAdmin}
          />
        </div>

        <input
          name="how_long_to_beat"
          type="text"
          placeholder="How Long To Beat (hours)"
          value={newGame.how_long_to_beat}
          onChange={handleChange}
          className="bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted px-2 py-2 rounded w-full h-[38px] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      <div className="mb-3">
        <label className="block mb-1 font-semibold text-content-secondary">My Genre (select multiple):</label>
        <Select
          isMulti
          closeMenuOnSelect={false}
          options={genreOptions}
          value={selectedGenres}
          onChange={handleGenreSelect}
          styles={customStyles}
          placeholder="Select genres..."
        />
      </div>

      <textarea
        name="thoughts"
        placeholder="Thoughts"
        value={newGame.thoughts}
        onChange={handleChange}
        className="bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted px-2 py-2 rounded w-full mb-4 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        rows={3}
      />

      <div className="mb-4">
        <label className="block mb-1 font-semibold text-content-secondary">My Score (0-10):</label>
        <input
          name="my_score"
          type="number"
          min="0"
          max="10"
          step="0.1"
          placeholder="e.g., 8.5"
          value={newGame.my_score}
          onChange={handleChange}
          className="bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted px-2 py-2 rounded w-full h-[38px] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      <button
        type="submit"
        className="bg-action-primary hover:bg-action-primary-hover text-content-primary px-4 py-2 rounded w-full font-medium transition-colors"
      >
        {isAdmin ? 'Add Game' : 'Suggest Game'}
      </button>
    </form>
  );
};

export default AddGameForm;