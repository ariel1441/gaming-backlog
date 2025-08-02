import React, { useState, useEffect } from 'react';

const EditGameForm = ({ game, onSubmit, onCancel, statuses }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    status: '',
    how_long_to_beat: '',
    my_genre: '',
    thoughts: '',
    my_score: ''
  });

  useEffect(() => {
    if (game) {
      setFormData({
        id: game.id,
        name: game.name || '',
        status: game.status || '',
        how_long_to_beat: game.how_long_to_beat || '',
        my_genre: game.my_genre || '',
        thoughts: game.thoughts || '',
        my_score: game.my_score || ''
      });
    }
  }, [game]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (!game) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-surface-border text-content-primary rounded-xl p-6 w-full max-w-lg shadow-glow-primary relative">
        <button
          onClick={onCancel}
          className="absolute top-2 right-2 text-content-muted hover:text-action-danger text-xl transition-colors"
          title="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-4 text-content-primary">Edit Game: {game.name}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1 text-content-secondary">Game Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full p-2 rounded bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium mb-1 text-content-secondary">Status *</label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              required
              className="w-full p-2 rounded bg-surface-elevated border border-surface-border text-content-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select Status</option>
              {statuses.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="how_long_to_beat" className="block text-sm font-medium mb-1 text-content-secondary">
              How Long to Beat (hours)
            </label>
            <input
              type="number"
              id="how_long_to_beat"
              name="how_long_to_beat"
              value={formData.how_long_to_beat}
              onChange={handleChange}
              min="0"
              className="w-full p-2 rounded bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="my_genre" className="block text-sm font-medium mb-1 text-content-secondary">My Genre</label>
            <input
              type="text"
              id="my_genre"
              name="my_genre"
              value={formData.my_genre}
              onChange={handleChange}
              placeholder="e.g., RPG, Action, Indie"
              className="w-full p-2 rounded bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="thoughts" className="block text-sm font-medium mb-1 text-content-secondary">Thoughts</label>
            <textarea
              id="thoughts"
              name="thoughts"
              value={formData.thoughts}
              onChange={handleChange}
              rows="3"
              placeholder="Your thoughts about the game..."
              className="w-full p-2 rounded bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="my_score" className="block text-sm font-medium mb-1 text-content-secondary">My Score (0–10)</label>
            <input
              type="number"
              id="my_score"
              name="my_score"
              value={formData.my_score}
              onChange={handleChange}
              min="0"
              max="10"
              step="0.1"
              className="w-full p-2 rounded bg-surface-elevated border border-surface-border text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded bg-surface-elevated hover:bg-surface-border text-content-primary border border-surface-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-action-primary hover:bg-action-primary-hover text-content-primary transition-colors"
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