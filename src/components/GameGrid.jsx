import React from "react";
import GameCard from "./GameCard";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const SortableGameCard = ({ game, onClick, onEdit, onDelete, isDragging }) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: game.id });

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
      />
    </div>
  );
};

const GameGrid = ({
  games = [], // <-- safe default
  onSelectGame,
  onEditGame,
  onDeleteGame,
  onReorder, // presence of this enables drag-and-drop for the owner
}) => {
  const initial = Array.isArray(games) ? games : [];
  const [localGames, setLocalGames] = React.useState(initial);
  const [activeId, setActiveId] = React.useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  React.useEffect(() => {
    setLocalGames(Array.isArray(games) ? games : []);
  }, [games]);

  const handleDragStart = (event) => setActiveId(event.active.id);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const current = Array.isArray(localGames) ? localGames : [];
    const oldIndex = current.findIndex((g) => g.id === active.id);
    const newIndex = current.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const draggedGame = current[oldIndex];
    const targetGame = current[newIndex];

    if (draggedGame?.status_rank !== targetGame?.status_rank) {
      console.log("Cannot move games between different ranks");
      return;
    }

    const newOrder = arrayMove(current, oldIndex, newIndex);
    setLocalGames(newOrder);

    if (onReorder) {
      const sameRankGames = newOrder.filter(
        (g) => g.status_rank === draggedGame.status_rank
      );
      const targetIndexInRank = sameRankGames.findIndex(
        (g) => g.id === draggedGame.id
      );
      await onReorder(draggedGame.id, targetIndexInRank, draggedGame.status);
    }
  };

  const list = Array.isArray(localGames) ? localGames : [];
  if (list.length === 0) {
    return (
      <div className="text-center py-10 text-content-muted">
        <div className="text-6xl mb-4">🎮</div>
        <p className="text-xl">No games found.</p>
        <p className="text-sm mt-2">Try adjusting your search or filters.</p>
      </div>
    );
  }

  const filteredGames = list.filter((game) => game?.name?.trim());

  // Read-only grid when no reorder handler is provided
  if (!onReorder) {
    return (
      <div
        className="grid gap-4"
        style={{
          // Keep cards at a comfortable width (≈ the 3-col look),
          // but allow as many columns as fit on wide screens.
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}
      >
        {filteredGames.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            onClick={() => onSelectGame?.(game)}
            onEdit={undefined}
            onDelete={undefined}
            readOnly={true}
          />
        ))}
      </div>
    );
  }

  // Drag-and-drop grid when onReorder is provided
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={filteredGames.map((g) => g.id)}
        strategy={rectSortingStrategy}
      >
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          }}
        >
          {filteredGames.map((game) => (
            <SortableGameCard
              key={game.id}
              game={game}
              onClick={() => onSelectGame?.(game)}
              onEdit={() => onEditGame?.(game)}
              onDelete={() => onDeleteGame?.(game.id)}
              isDragging={activeId === game.id}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default GameGrid;
