import React from "react";
import { Gamepad2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import GameCard from "./GameCard";
import { EmptyState } from "./ui";
import { buildRankReorderRequest } from "../utils/reorder";

const SortableGameCard = ({
  game,
  onClick,
  onEdit,
  onDelete,
  isDragging,
  viewMode,
}) => {
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
      className="h-full w-full max-w-full sm:max-w-none min-w-0 mx-auto sm:mx-0"
    >
      <GameCard
        game={game}
        onClick={onClick}
        onEdit={onEdit}
        onDelete={onDelete}
        variant={viewMode}
      />
    </div>
  );
};

const gridClasses = {
  grid: "grid gap-3 w-full max-w-[480px] px-2 sm:px-0 mx-auto sm:max-w-none [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] sm:[grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]",
  compact:
    "grid items-stretch gap-3 w-full max-w-[420px] px-2 sm:px-0 mx-auto sm:max-w-none [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))] sm:[grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]",
  list: "grid grid-cols-1 gap-3 w-full px-2 sm:px-0",
};

const GameGrid = ({
  games = [],
  onSelectGame,
  onEditGame,
  onDeleteGame,
  onReorder,
  canManage = false,
  emptyState,
  viewMode = "grid",
}) => {
  const initial = Array.isArray(games) ? games : [];
  const [localGames, setLocalGames] = React.useState(initial);
  const [activeId, setActiveId] = React.useState(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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

    const request = buildRankReorderRequest(localGames, activeKey, overKey);
    if (!request) return;

    const { gameId, targetIndex, newOrder } = request;
    setLocalGames(newOrder);

    if (onReorder) {
      await onReorder(gameId, targetIndex);
    }
  };

  const list = Array.isArray(localGames) ? localGames : [];
  if (list.length === 0) {
    return (
      <EmptyState
        icon={emptyState?.icon || Gamepad2}
        title={emptyState?.title || "No games found."}
        description={
          emptyState?.description || "Try adjusting your search or filters."
        }
        action={emptyState?.action}
        className="py-10"
      />
    );
  }

  const filteredGames = list.filter((game) => game?.name?.trim());

  if (filteredGames.length === 1) {
    const only = filteredGames[0];
    return (
      <div className="w-full px-2 sm:px-0 flex justify-center">
        <div className="w-full max-w-[420px]">
          <GameCard
            key={only.id}
            game={only}
            onClick={() => onSelectGame?.(only)}
            readOnly={!canManage}
            onEdit={canManage ? () => onEditGame?.(only) : undefined}
            onDelete={canManage ? () => onDeleteGame?.(only.id) : undefined}
            variant={viewMode}
          />
        </div>
      </div>
    );
  }

  if (!onReorder) {
    return (
      <div className={gridClasses[viewMode] || gridClasses.grid}>
        {filteredGames.map((game) => (
          <div
            key={game.id}
            className="h-full w-full max-w-full sm:max-w-none min-w-0 mx-auto sm:mx-0"
          >
            <GameCard
              game={game}
              onClick={() => onSelectGame?.(game)}
              readOnly={!canManage}
              onEdit={canManage ? () => onEditGame?.(game) : undefined}
              onDelete={canManage ? () => onDeleteGame?.(game.id) : undefined}
              variant={viewMode}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={viewMode === "list" ? [restrictToVerticalAxis] : undefined}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext
        items={filteredGames.map((g) => String(g.id))}
        strategy={rectSortingStrategy}
      >
        <div
          className={`${gridClasses[viewMode] || gridClasses.grid} overflow-x-clip`}
        >
          {filteredGames.map((game) => (
            <SortableGameCard
              key={game.id}
              game={game}
              onClick={() => onSelectGame?.(game)}
              onEdit={() => onEditGame?.(game)}
              onDelete={() => onDeleteGame?.(game.id)}
              isDragging={activeId === String(game.id)}
              viewMode={viewMode}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default GameGrid;
