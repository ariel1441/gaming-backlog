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
    useSortable({ id: String(game.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 999 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // Phone: allow full shrink; >=sm keep your previous sizing
      className="w-full max-w-full sm:max-w-none min-w-0 mx-auto sm:mx-0"
    >
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
  games = [],
  onSelectGame,
  onEditGame,
  onDeleteGame,
  onReorder, // if present, enables drag-and-drop
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

      // Destination status = target card’s status
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

  // If exactly one result, center it and cap width (phone-safe)
  if (filteredGames.length === 1) {
    const only = filteredGames[0];
    return (
      <div className="w-full px-2 sm:px-0 flex justify-center">
        <div className="w-full max-w-[420px]">
          <GameCard
            key={only.id}
            game={only}
            onClick={() => onSelectGame?.(only)}
            onEdit={onReorder ? () => onEditGame?.(only) : undefined}
            onDelete={onReorder ? () => onDeleteGame?.(only.id) : undefined}
          />
        </div>
      </div>
    );
  }

  // Read-only grid (mobile-friendly)
  if (!onReorder) {
    return (
      <div
        className="
          grid gap-4 
          w-full max-w-[480px] px-2 sm:px-0 mx-auto sm:max-w-none
          [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]
          sm:[grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]
        "
      >
        {filteredGames.map((game) => (
          <div
            key={game.id}
            className="w-full max-w-full sm:max-w-none min-w-0 mx-auto sm:mx-0"
          >
            <GameCard
              game={game}
              onClick={() => onSelectGame?.(game)}
              onEdit={undefined}
              onDelete={undefined}
            />
          </div>
        ))}
      </div>
    );
  }

  // Drag-and-drop grid (mobile-friendly)
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={filteredGames.map((g) => String(g.id))}
        strategy={rectSortingStrategy}
      >
        <div
          className="
            grid gap-4 
            w-full max-w-[480px] px-2 sm:px-0 mx-auto sm:max-w-none
            [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]
            sm:[grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]
          "
        >
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
