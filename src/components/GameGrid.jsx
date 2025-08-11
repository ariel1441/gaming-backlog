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
  // Use stable string IDs to avoid type mismatches
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: String(game.id) });

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
  const [activeId, setActiveId] = React.useState(null); // store as string

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  React.useEffect(() => {
    setLocalGames(Array.isArray(games) ? games : []);
  }, [games]);

  const handleDragStart = (event) => setActiveId(String(event.active.id));

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;

    const current = Array.isArray(localGames) ? localGames : [];
    const oldIndex = current.findIndex((g) => String(g.id) === activeKey);
    const newIndex = current.findIndex((g) => String(g.id) === overKey);
    if (oldIndex === -1 || newIndex === -1) return;

    const draggedGame = current[oldIndex];
    const targetGame = current[newIndex];

    // Keep your rule: no moving across different ranks
    if (draggedGame?.status_rank !== targetGame?.status_rank) {
      console.log("Cannot move games between different ranks");
      return;
    }

    // Optimistic UI reorder
    const newOrder = arrayMove(current, oldIndex, newIndex);
    setLocalGames(newOrder);

    if (onReorder) {
      // Recompute index within this rank only
      const sameRankGames = newOrder.filter(
        (g) => g.status_rank === draggedGame.status_rank
      );
      const targetIndexInRank = sameRankGames.findIndex(
        (g) => String(g.id) === activeKey
      );

      // ✅ Use the destination status (target card’s status)
      const destStatus = targetGame.status;

      await onReorder(draggedGame.id, targetIndexInRank, destStatus);
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
        // DnD expects a stable array of IDs — make them strings
        items={filteredGames.map((g) => String(g.id))}
        strategy={rectSortingStrategy}
      >
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]">
          {filteredGames.map((game) => (
            <SortableGameCard
              key={game.id}
              game={game}
              onClick={() => onSelectGame?.(game)}
              onEdit={() => onEditGame?.(game)}
              onDelete={() => onDeleteGame?.(game.id)}
              isDragging={activeId === String(game.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default GameGrid;
