import React from 'react';
import GameCard from './GameCard';

const GameGrid = ({ games, onSelectGame }) => {
  if (!games.length) {
    return <p>No games found.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {games
        .filter((game) => game.name?.trim())
        .map((game, idx) => (
          <GameCard
            key={idx}
            game={game}
            onClick={() => onSelectGame(game)}
          />
        ))}
    </div>
  );
};

export default GameGrid;
