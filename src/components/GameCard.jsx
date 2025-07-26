import React from 'react';

const GameCard = ({ game, onClick }) => {
  return (
    <div
      className="
        bg-gray-900 rounded-lg shadow-md p-4 cursor-pointer
        transition-shadow duration-300
        hover:shadow-[0_0_15px_4px_rgba(124,58,237,0.7)]
      "
      onClick={() => onClick(game)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if(e.key === 'Enter') onClick(game); }}
      aria-label={`View details for ${game.name}`}
    >
      {game.cover && (
        <img
          src={game.cover}
          alt={game.name}
          className="w-full h-60 object-cover rounded mb-4 shadow-[0_0_5px_3px_rgba(124,58,237,0.7)]"
        />
      )}
      <h3 className="text-lg font-semibold text-white">{game.name}</h3>
      <p className="text-sm text-purple-400 capitalize">Status: {game.status || 'N/A'}</p>
      <p className="text-sm text-purple-400 capitalize">Genres: {game.genres || 'N/A'}</p>
      <p className="text-sm text-purple-400">Rating: {game.rating || 'N/A'}</p>
      <p className="text-sm text-purple-400 capitalize">My Genres: {game.my_genre || 'N/A'}</p>
      <p className="text-sm text-purple-400">
        How Long to Beat: {game.how_long_to_beat != null ? `${game.how_long_to_beat} hours` : 'N/A'}
      </p>

    </div>
  );
};

export default GameCard;
