import React, { useState } from 'react';

const featureIconsMap = {
  multiplayer: '🎮',
  singleplayer: '👤',
  'co-op': '🤝',
  vr: '🕶️',
  'controller support': '🕹️',
  achievements: '🏆',
};

const GameModal = ({ game, onClose }) => {
  const [showDescription, setShowDescription] = useState(false);
  if (!game) return null;

  const invalidValues = ['#N/A', 'N/A', 'null', '', null, undefined];

  const cover = game.cover || 'https://via.placeholder.com/300x180?text=No+Image';
  const metacritic = game.metacritic && !invalidValues.includes(game.metacritic) ? game.metacritic : 'N/A';
  const my_genre = game.my_genre || 'Unknown';
  const status = game.status || 'Unknown';
  const rating = game.rating || 'N/A';
  const releaseDate = game.releaseDate || 'Unknown';
  const genres = game.genres || 'N/A';
  const thoughts = game.thoughts ?? game.thoughts ?? 'N/A';
  const my_score = game.my_score || 'N/A';
  const description = game.description || 'N/A';

  let features = game.features || [];
  if (typeof features === 'string') {
    features = features.split(',').map(f => f.trim()).filter(Boolean);
  }

  const toggleDescription = () => {
    setShowDescription(prev => !prev);
  };

  const renderFeatureIcons = (features) => {
    if (!Array.isArray(features) || features.length === 0) return null;
    return (
      <div className="flex gap-3 mt-2" aria-label="Features">
        {features.map((feat, i) => {
          const key = feat.toLowerCase();
          if (!featureIconsMap[key]) return null;
          return (
            <span key={i} title={feat} className="text-2xl select-none" role="img" aria-label={feat}>
              {featureIconsMap[key]}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 overflow-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-modal-title"
    >
      <div
        className="bg-gray-900 text-white rounded-2xl p-8 w-full max-w-5xl 
             shadow-[0_0_15px_4px_rgba(124,58,237,0.6)] relative max-h-[90vh] overflow-y-auto 
             flex flex-col md:flex-row gap-8 transition-shadow duration-300 text-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-4xl font-bold leading-none text-purple-400 hover:text-purple-600 transition-colors focus:outline-none"
          aria-label="Close modal"
        >
          &times;
        </button>

        <img
          src={cover}
          alt={game.name || 'Game cover image'}
          className="w-full md:w-1/3 rounded object-cover max-h-[420px] 
                    shadow-[0_0_10px_3px_rgba(124,58,237,0.7)]"
          loading="lazy"
        />

        <div className="flex-1 flex flex-col">
          <h2 id="game-modal-title" className="text-4xl font-bold mb-6 tracking-wide">{game.name}</h2>

          <p><strong>Status:</strong> <span className="text-purple-400">{status}</span></p>
          <p>
            <strong>How Long to Beat:</strong>{' '}
            <span className="text-purple-400">
            {game.how_long_to_beat != null ? `${game.how_long_to_beat} hours` : 'N/A'}
            </span>
          </p>
          <p><strong>Genres:</strong> <span className="text-purple-400">{genres}</span></p>
          <p><strong>My Genre:</strong> <span className="text-purple-400">{my_genre}</span></p>
          <p><strong>Release Date:</strong> <span className="text-purple-400">{releaseDate}</span></p>
          <p><strong>Metacritic Score:</strong> <span className="text-green-400 font-semibold">{metacritic}</span></p>
          <p><strong>RAWG Rating:</strong> <span className="text-yellow-400 font-semibold">{rating}</span></p>
          <p><strong>My Score:</strong> <span className="text-purple-400">{my_score}</span></p>
          <p><strong>Thoughts:</strong> <span className="text-purple-400 whitespace-pre-wrap">{thoughts}</span></p>

          <button
            onClick={toggleDescription}
            className="mt-4 mb-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 rounded text-white transition-colors"
            aria-expanded={showDescription}
            aria-controls="game-description"
          >
            {showDescription ? 'Hide Description' : 'Show Description'}
          </button>

          {showDescription && (
            <div
              id="game-description"
              className="game-description mt-2 text-gray-300 text-base leading-relaxed"
              dangerouslySetInnerHTML={{ __html: description }}
            />
          )}

          {renderFeatureIcons(features)}
        </div>
      </div>
    </div>
  );
};

export default GameModal;
