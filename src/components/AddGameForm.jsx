import React, { useState, useEffect } from "react";
import Select from "react-select";
import { useAuth } from "../contexts/AuthContext"; // ✅ useAuth instead of isAdmin prop

const AddGameForm = ({
  addFormRef,
  newGame,
  setNewGame,
  handleAddGame,
  allMyGenres = [],
  allStatuses = [],
}) => {
  const { isAuthenticated } = useAuth(); // ✅ every logged-in user can add/edit their own games
  const [errors, setErrors] = useState({});

  useEffect(() => {
    // If not logged in, default status to "recommended by someone"
    if (!isAuthenticated) {
      setNewGame((prev) => ({
        ...prev,
        status: "recommended by someone",
      }));
    }
  }, [isAuthenticated, setNewGame]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewGame((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const newErrors = {};
    if (!newGame.name.trim()) newErrors.name = "Name is required.";
    if (isAuthenticated && !newGame.status?.trim())
      newErrors.status = "Status is required.";
    if (newGame.how_long_to_beat && isNaN(newGame.how_long_to_beat)) {
      newErrors.how_long_to_beat = "How long to beat must be a number.";
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

  const statusOptions = allStatuses.map((status) => ({
    label: status,
    value: status,
  }));
  const selectedStatus = newGame.status
    ? { label: newGame.status, value: newGame.status }
    : null;
  const handleStatusSelect = (selected) => {
    setNewGame((prev) => ({ ...prev, status: selected?.value || "" }));
  };

  const genreOptions = allMyGenres.map((tag) => ({
    label: tag,
    value: tag,
  }));
  const selectedGenres = newGame.my_genre
    ? newGame.my_genre
        .split(",")
        .map((tag) => ({ label: tag.trim(), value: tag.trim() }))
    : [];
  const handleGenreSelect = (selected) => {
    const joined = selected
      ? selected.map((option) => option.value).join(", ")
      : "";
    setNewGame((prev) => ({ ...prev, my_genre: joined }));
  };

  const customStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: "#374151",
      borderColor: state.isFocused ? "#f97316" : "#4b5563",
      color: "#f9fafb",
      minHeight: "38px",
      boxShadow: state.isFocused ? "0 0 0 2px rgba(249, 115, 22, 0.5)" : "none",
      transition: "all 0.2s ease",
      "&:hover": {
        borderColor: "#f97316",
      },
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: "#374151",
      border: "1px solid #4b5563",
      zIndex: 10,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "#f97316"
        : state.isFocused
          ? "#fb923c"
          : "#374151",
      color: "#f9fafb",
      cursor: "pointer",
      "&:active": {
        backgroundColor: "#f97316",
      },
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: "#f97316",
      color: "#f9fafb",
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: "#f9fafb",
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: "#f9fafb",
      ":hover": {
        backgroundColor: "#fb923c",
        color: "#ffffff",
      },
    }),
    singleValue: (base) => ({
      ...base,
      color: "#f9fafb",
    }),
    input: (base) => ({
      ...base,
      color: "#f9fafb",
    }),
  };

  return (
    <form
      ref={addFormRef}
      onSubmit={onSubmit}
      className="bg-surface-card border border-surface-border p-4 rounded mb-6"
    >
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold text-content-primary">
          Add a New Game
        </h2>
        {!isAuthenticated && (
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
            isDisabled={!isAuthenticated} // ✅ only logged-in users pick status
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
        <label className="block mb-1 font-semibold text-content-secondary">
          My Genre (select multiple):
        </label>
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
        placeholder="My Thoughts / Expectation"
        value={newGame.thoughts}
        onChange={handleChange}
        className="bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted px-2 py-2 rounded w-full mb-4 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        rows={3}
      />

      <div className="mb-4">
        <label className="block mb-1 font-semibold text-content-secondary">
          My Score (0-10):
        </label>
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
        {isAuthenticated ? "Add Game" : "Suggest Game"}
      </button>
    </form>
  );
};

export default AddGameForm;
