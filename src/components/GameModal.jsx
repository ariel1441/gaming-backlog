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
  const thoughts = game.thoughts ?? game.thoughts ?? '';
  const my_score = game.my_score || '';
  const description = game.description || 'N/A';

  let features = game.features || [];
  if (typeof features === 'string') {
    features = features.split(',').map(f => f.trim()).filter(Boolean);
  }

  const toggleDescription = () => {
    setShowDescription(prev => !prev);
  };

  // Status color mapping using your color scheme
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'bg-state-success/20 text-state-success border-state-success/30';
      case 'playing': return 'bg-primary/20 text-primary border-primary/30';
      case 'backlog': return 'bg-state-warning/20 text-state-warning border-state-warning/30';
      case 'dropped': return 'bg-state-error/20 text-state-error border-state-error/30';
      case 'on hold': return 'bg-secondary/20 text-secondary border-secondary/30';
      default: return 'bg-content-muted/20 text-content-muted border-content-muted/30';
    }
  };

  const renderFeatureIcons = (features) => {
    if (!Array.isArray(features) || features.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-3 mt-6">
        <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-2 w-full">Features</div>
        <div className="flex flex-wrap gap-2">
          {features.map((feat, i) => {
            const key = feat.toLowerCase();
            if (!featureIconsMap[key]) return null;
            return (
              <span 
                key={i} 
                title={feat} 
                className="text-lg bg-surface-elevated/40 px-3 py-2 rounded-lg border border-surface-border/50 hover:border-primary/50 transition-colors" 
                role="img" 
                aria-label={feat}
              >
                {featureIconsMap[key]}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-modal p-4 overflow-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-modal-title"
    >
      <div
        className="bg-surface-bg/95 backdrop-blur-md text-content-primary rounded-3xl p-8 w-full max-w-6xl
             border border-surface-border shadow-glow-primary relative max-h-[90vh] overflow-y-auto 
             flex flex-col lg:flex-row gap-8 transition-all duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-4xl font-bold leading-none text-content-muted hover:text-action-danger transition-colors duration-300 focus:outline-none hover:scale-110 transform z-10"
          aria-label="Close modal"
        >
          &times;
        </button>

        {/* Left side - Image */}
        <div className="lg:w-2/5 flex-shrink-0">
          <img
            src={cover}
            alt={game.name || 'Game cover image'}
            className="w-full rounded-2xl object-cover h-full max-h-[80vh] shadow-glow-primary border border-surface-border/20"
            loading="lazy"
          />
        </div>

        {/* Right side - Content */}
        <div className="flex-1 flex flex-col">
          {/* Title */}
          <h2 id="game-modal-title" className="text-4xl font-bold mb-6 bg-gradient-to-r from-primary to-primary-dark bg-clip-text text-transparent tracking-wide">
            {game.name}
          </h2>

          {/* Status Badge - Most Important */}
          <div className="mb-6">
            <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-3">Status</div>
            <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border ${getStatusColor(status)}`}>
              {status}
            </span>
          </div>

          {/* Key Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div>
              <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-2">
                How Long to Beat
              </div>
              <div className="text-state-success font-bold text-xl">
                {game.how_long_to_beat != null ? `🕒 ${game.how_long_to_beat}h` : 'N/A'}
              </div>
            </div>
                        
            <div>
              <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-2">RAWG Rating</div>
              <div className="text-state-warning font-bold text-xl">⭐ {rating}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-2">Metacritic</div>
              <div className="text-primary font-bold text-xl">🎯 {metacritic}</div>
            </div>

            {my_score && (
              <div>
                <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-2">My Score</div>
                <div className="text-secondary font-bold text-xl">💯 {my_score}</div>
              </div>
            )}
          </div>

          {/* Secondary Info */}
          <div className="space-y-6 pt-6 border-t border-surface-border/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-2">My Genre</div>
                <div className="text-content-primary text-lg">{my_genre}</div>
              </div>

             <div>
              <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-2">Genres</div>
              <div className="text-content-primary text-lg">{genres}</div>
            </div>

              <div>
                <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-2">Release Date</div>
                <div className="text-content-primary text-lg">{releaseDate}</div>
              </div>
            </div>

           

            {/* My Thoughts */}
            {thoughts && thoughts.trim() && (
              <div>
                <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-3">My Thoughts</div>
                <div className="bg-surface-card/30 border border-surface-border/30 p-4 rounded-xl">
                  <span className="text-content-primary whitespace-pre-wrap leading-relaxed">{thoughts}</span>
                </div>
              </div>
            )}

            {/* Description Toggle */}
            <div>
              <button
                onClick={toggleDescription}
                className="px-6 py-3 bg-gradient-to-r from-action-primary to-action-primary-hover hover:from-primary-light hover:to-primary rounded-xl text-content-primary font-semibold transition-all duration-300 hover:shadow-glow-primary hover:scale-105"
                aria-expanded={showDescription}
                aria-controls="game-description"
              >
                {showDescription ? '🙈 Hide Description' : '📖 Show Description'}
              </button>

              {showDescription && (
                <div
                  id="game-description"
                  className="mt-4 p-4 bg-surface-card/30 border border-surface-border/30 rounded-xl text-content-primary leading-relaxed backdrop-blur-sm"
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              )}
            </div>

            {/* Features */}
            {renderFeatureIcons(features)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameModal;