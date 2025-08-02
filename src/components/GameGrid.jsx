import React from 'react';
import GameCard from './GameCard';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableGameCard = ({ game, onClick, onEdit, onDelete, isAdmin, isDragging }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: game.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 999 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GameCard
        game={game}
        onClick={onClick}
        onEdit={onEdit}
        onDelete={onDelete}
        isAdmin={isAdmin}
      />
    </div>
  );
};

const GameGrid = ({ games, onSelectGame, onEditGame, onDeleteGame, isAdmin, onReorder }) => {
  const [localGames, setLocalGames] = React.useState(games);
  const [activeId, setActiveId] = React.useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update local games when props change
  React.useEffect(() => {
    setLocalGames(games);
  }, [games]);

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = localGames.findIndex(g => g.id === active.id);
    const newIndex = localGames.findIndex(g => g.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const draggedGame = localGames[oldIndex];
    const targetGame = localGames[newIndex];

    // Check if games are in the same status
    if (draggedGame.status !== targetGame.status) {
      console.log('Cannot move games between different statuses');
      return;
    }

    // Update local state immediately for smooth UX
    const newOrder = arrayMove(localGames, oldIndex, newIndex);
    setLocalGames(newOrder);

    // Call the reorder function with the correct status-specific index
    if (onReorder) {
      // Get ONLY games in the same status from the NEW order
      const sameStatusGames = newOrder.filter(g => g.status === draggedGame.status);
      const targetIndexInStatus = sameStatusGames.findIndex(g => g.id === draggedGame.id);
      
      console.log(`Moving game ${draggedGame.id} to index ${targetIndexInStatus} within status "${draggedGame.status}"`);
      console.log(`Same status games:`, sameStatusGames.map(g => `${g.name}(${g.id})`));
      
      await onReorder(draggedGame.id, targetIndexInStatus, draggedGame.status);
    }
  };

  if (!games.length) {
    return (
      <div className="text-center py-10 text-content-muted">
        <div className="text-6xl mb-4">🎮</div>
        <p className="text-xl">No games found.</p>
        <p className="text-sm mt-2">Try adjusting your search or filters.</p>
      </div>
    );
  }

  const filteredGames = localGames.filter(game => game.name?.trim());

  if (!isAdmin) {
    // Regular grid for non-admins
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filteredGames.map(game => (
          <GameCard
            key={game.id}
            game={game}
            onClick={() => onSelectGame(game)}
            onEdit={() => onEditGame(game)}
            onDelete={() => onDeleteGame(game.id)}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    );
  }

  // Admin mode with drag-and-drop
  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCenter} 
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={filteredGames.map(g => g.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredGames.map(game => (
            <SortableGameCard
              key={game.id}
              game={game}
              onClick={() => onSelectGame(game)}
              onEdit={() => onEditGame(game)}
              onDelete={() => onDeleteGame(game.id)}
              isAdmin={isAdmin}
              isDragging={activeId === game.id}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default GameGrid;