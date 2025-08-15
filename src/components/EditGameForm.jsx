import React, { useState, useEffect } from "react";

const EditGameForm = ({ game, onSubmit, onCancel, statuses }) => {
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    status: "",
    how_long_to_beat: "",
    my_genre: "",
    thoughts: "",
    my_score: "",
    started_at: "", // NEW
    finished_at: "", // NEW
  });

  useEffect(() => {
    if (game) {
      // type="date" wants YYYY-MM-DD; guard if backend sends null or full timestamps later
      const toDateStr = (v) => {
        if (!v) return "";
        if (typeof v === "string") {
          const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
          if (m) return m[1]; // already good: "YYYY-MM-DD" or ISO -> take first 10
        }
        const d = new Date(v);
        if (isNaN(d)) return "";
        const y = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${mm}-${dd}`; // normalize to UTC day to avoid local offset shifts
      };
      setFormData({
        id: game.id,
        name: game.name || "",
        status: game.status || "",
        how_long_to_beat: game.how_long_to_beat ?? "",
        my_genre: game.my_genre || "",
        thoughts: game.thoughts || "",
        my_score: game.my_score ?? "",
        started_at: toDateStr(game.started_at), // NEW
        finished_at: toDateStr(game.finished_at), // NEW
      });
    }
  }, [game]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Send dates as strings "YYYY-MM-DD" (or empty string → your backend treats as null)
    onSubmit(formData);
  };

  if (!game) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-surface-border rounded-xl p-6 w-full max-w-lg shadow-glow-primary relative">
        <button onClick={onCancel} className="" aria-label="Close" />
        {/* ... unchanged UI ... */}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* name */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium mb-1 text-content-secondary"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              className="w-full p-2 rounded bg-surface-elevated ...e-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* status */}
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium mb-1 text-content-secondary"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full p-2 rounded bg-surface-elevated ...e-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* HLTB */}
          <div>
            <label
              htmlFor="how_long_to_beat"
              className="block text-sm font-medium mb-1 text-content-secondary"
            >
              How long to beat (hours)
            </label>
            <input
              type="number"
              id="how_long_to_beat"
              name="how_long_to_beat"
              value={formData.how_long_to_beat}
              onChange={handleChange}
              min="0"
              step="1"
              className="w-full p-2 rounded bg-surface-elevated ...e-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* genre */}
          <div>
            <label
              htmlFor="my_genre"
              className="block text-sm font-medium mb-1 text-content-secondary"
            >
              My Genre
            </label>
            <input
              type="text"
              id="my_genre"
              name="my_genre"
              value={formData.my_genre}
              onChange={handleChange}
              className="w-full p-2 rounded bg-surface-elevated ...e-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* thoughts */}
          <div>
            <label
              htmlFor="thoughts"
              className="block text-sm font-medium mb-1 text-content-secondary"
            >
              Thoughts
            </label>
            <textarea
              id="thoughts"
              name="thoughts"
              value={formData.thoughts}
              onChange={handleChange}
              rows={4}
              className="w-full p-2 rounded bg-surface-elevated ...e-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* score */}
          <div>
            <label
              htmlFor="my_score"
              className="block text-sm font-medium mb-1 text-content-secondary"
            >
              My Score (0–10)
            </label>
            <input
              type="number"
              id="my_score"
              name="my_score"
              value={formData.my_score}
              onChange={handleChange}
              min="0"
              max="10"
              step="1"
              className="w-full p-2 rounded bg-surface-elevated ...e-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* NEW: dates */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2
          gap-4"
          >
            <div>
              <label
                htmlFor="started_at"
                className="block text-sm font-medium mb-1 text-content-secondary"
              >
                Started on
              </label>
              <input
                type="date"
                id="started_at"
                name="started_at"
                value={formData.started_at}
                onChange={handleChange}
                className="w-full p-2 rounded bg-surface-elevated text-content-primary border border-surface-border focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none [color-scheme:dark]"
              />
            </div>

            <div>
              <label
                htmlFor="finished_at"
                className="block text-sm font-medium mb-1 text-content-secondary"
              >
                Finished on
              </label>
              <input
                type="date"
                id="finished_at"
                name="finished_at"
                value={formData.finished_at}
                onChange={handleChange}
                className="w-full p-2 rounded bg-surface-elevated text-content-primary border border-surface-border focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>

          <div
            className="flex justify-end gap-4 
          mt-6"
          >
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded bg-surface-elevated bor...r-surface-border text-content-secondary hover:text-content-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-action-primary hov...:bg-action-primary-hover text-content-primary transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditGameForm;
