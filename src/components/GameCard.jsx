import React from 'react';

const GameCard = ({ game, onClick, onEdit, onDelete, isAdmin }) => {
  const handleCardClick = (e) => {
    if (e.target.closest('.action-button')) return;
    onClick();
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    if (!isAdmin) {
      alert('Admin access required to edit games.');
      return;
    }
    onEdit();
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (!isAdmin) {
      alert('Admin access required to delete games.');
      return;
    }
    onDelete();
  };

  return (
    <div
      className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:bg-gray-700 transition-colors duration-200 relative group"
      onClick={handleCardClick}
    >
      {/* Action buttons - only show if admin */}
      {isAdmin && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
          <button
            onClick={handleEdit}
            className="action-button bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full text-xs font-bold shadow-lg"
            title="Edit game"
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            className="action-button bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-xs font-bold shadow-lg"
            title="Delete game"
          >
            🗑️
          </button>
        </div>
      )}

      {/* Game cover image */}
      {game.cover && (
        <div className="relative">
          <img
            src={game.cover}
            alt={game.name}
            className="w-full h-64 object-cover rounded-lg" // increased from h-56
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Game info */}
      <div className="p-2.5">
        <h3 className="text-base font-semibold mb-1.5 text-white truncate">
          {game.name}
        </h3>

        <div className="space-y-1 text-sm text-gray-300 leading-snug">
          {game.status && (
            <p className="truncate">
              <span className="font-medium">Status:</span> {game.status}
            </p>
          )}
          {game.my_genre && (
            <p className="truncate">
              <span className="font-medium">My Genres:</span> {game.my_genre}
            </p>
          )}
          {game.genres && (
            <p className="truncate">
              <span className="font-medium">Genres:</span> {game.genres}
            </p>
          )}
          {game.how_long_to_beat && (
            <p className="truncate">
              <span className="font-medium">How Long to Beat:</span> {game.how_long_to_beat}h
            </p>
          )}
          {game.rating && (
            <p className="truncate">
              <span className="font-medium">Rating:</span> {game.rating}/5
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameCard;