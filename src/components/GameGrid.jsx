import React from 'react';
import GameCard from './GameCard';

const GameGrid = ({ games, onSelectGame, onEditGame, onDeleteGame, isAdmin }) => {
  if (!games.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        <div className="text-6xl mb-4">🎮</div>
        <p className="text-xl">No games found.</p>
        <p className="text-sm mt-2">Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {games
        .filter((game) => game.name?.trim())
        .map((game, idx) => (
          <GameCard
            key={game.id || idx}
            game={game}
            onClick={() => onSelectGame(game)}
            onEdit={() => onEditGame(game)}
            onDelete={() => onDeleteGame(game.id)}
            isAdmin={isAdmin}
          />
        ))}
    </div>
  );
};

export default GameGrid;