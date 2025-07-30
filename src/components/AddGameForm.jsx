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

  // 🟣 Ensure non-admins always default to "recommended by someone"
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

  // ----- Status Select -----
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

  // ----- My Genre Multi-select -----
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
    control: (base) => ({
      ...base,
      backgroundColor: '#4B5563',
      borderColor: '#6B21A8',
      color: '#fff',
      minHeight: '38px',
    }),
    multiValue: (base) => ({ ...base, backgroundColor: '#6B21A8', color: '#fff' }),
    multiValueLabel: (base) => ({ ...base, color: '#fff' }),
    multiValueRemove: (base) => ({
      ...base,
      color: '#fff',
      ':hover': {
        backgroundColor: '#A855F7',
        color: '#fff',
      },
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? '#6B21A8'
        : state.isFocused
        ? '#A855F7'
        : '#374151',
      color: '#fff',
    }),
    menu: (base) => ({ ...base, backgroundColor: '#374151' }),
    input: (base) => ({ ...base, color: '#fff' }),
    singleValue: (base) => ({ ...base, color: '#fff' }),
  };

  return (
    <form
      ref={addFormRef}
      onSubmit={onSubmit}
      className="bg-gray-800 p-4 rounded mb-6"
    >
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">Add a New Game</h2>
        {!isAdmin && (
          <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-1 rounded border border-yellow-600">
            ⚠️ Status will be set to "recommended by someone"
          </span>
        )}
      </div>

      {Object.values(errors).length > 0 && (
        <div className="bg-red-900 text-red-300 p-2 rounded mb-3">
          <ul className="list-disc pl-5">
            {Object.values(errors).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 items-start">
        {/* Name */}
        <input
          name="name"
          type="text"
          placeholder="Name"
          value={newGame.name}
          onChange={handleChange}
          required
          className="bg-gray-700 text-white px-2 py-2 rounded w-full h-[38px]"
        />

        {/* Status */}
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

        {/* How Long To Beat */}
        <input
          name="how_long_to_beat"
          type="text"
          placeholder="How Long To Beat (hours)"
          value={newGame.how_long_to_beat}
          onChange={handleChange}
          className="bg-gray-700 text-white px-2 py-2 rounded w-full h-[38px]"
        />
      </div>

      {/* My Genre Multiselect */}
      <div className="mb-3">
        <label className="block mb-1 font-semibold">My Genre (select multiple):</label>
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

      {/* Thoughts */}
      <textarea
        name="thoughts"
        placeholder="Thoughts"
        value={newGame.thoughts}
        onChange={handleChange}
        className="bg-gray-700 text-white px-2 py-2 rounded w-full mb-4"
        rows={3}
      />

      {/* My Score */}
      <div className="mb-4">
        <label className="block mb-1 font-semibold">My Score (0-10):</label>
        <input
          name="my_score"
          type="number"
          min="0"
          max="10"
          step="0.1"
          placeholder="e.g., 8.5"
          value={newGame.my_score}
          onChange={handleChange}
          className="bg-gray-700 text-white px-2 py-2 rounded w-full h-[38px]"
        />
      </div>

      <button
        type="submit"
        className="bg-purple-600 px-4 py-2 rounded hover:bg-purple-700 w-full font-medium transition-colors"
      >
        {isAdmin ? 'Add Game' : 'Suggest Game'}
      </button>
    </form>
  );
};

export default AddGameForm;
