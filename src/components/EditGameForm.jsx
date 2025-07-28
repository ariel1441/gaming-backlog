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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-gray-900 text-white rounded-xl p-6 w-full max-w-lg shadow-lg relative">
        <button
          onClick={onCancel}
          className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xl"
          title="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-4">Edit Game: {game.name}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">Game Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white"
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium mb-1">Status *</label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              required
              className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white"
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
            <label htmlFor="how_long_to_beat" className="block text-sm font-medium mb-1">
              How Long to Beat (hours)
            </label>
            <input
              type="number"
              id="how_long_to_beat"
              name="how_long_to_beat"
              value={formData.how_long_to_beat}
              onChange={handleChange}
              min="0"
              className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white"
            />
          </div>

          <div>
            <label htmlFor="my_genre" className="block text-sm font-medium mb-1">My Genre</label>
            <input
              type="text"
              id="my_genre"
              name="my_genre"
              value={formData.my_genre}
              onChange={handleChange}
              placeholder="e.g., RPG, Action, Indie"
              className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white"
            />
          </div>

          <div>
            <label htmlFor="thoughts" className="block text-sm font-medium mb-1">Thoughts</label>
            <textarea
              id="thoughts"
              name="thoughts"
              value={formData.thoughts}
              onChange={handleChange}
              rows="3"
              placeholder="Your thoughts about the game..."
              className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white"
            />
          </div>

          <div>
            <label htmlFor="my_score" className="block text-sm font-medium mb-1">My Score (0–10)</label>
            <input
              type="number"
              id="my_score"
              name="my_score"
              value={formData.my_score}
              onChange={handleChange}
              min="0"
              max="10"
              step="0.1"
              className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white"
            />
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white"
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
