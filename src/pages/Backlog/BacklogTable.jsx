import React from "react";
import SteamPrice from '../../components/SteamPrice';
import {
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Crown,
  Gamepad2,
  GripVertical,
  ListPlus,
  Pencil,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../../contexts/AuthContext";
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import {
  ActionMenu,
  AdaptiveChipList,
  DataTableFrame,
  DataTableSortButton,
  GameCover,
  StatusBadge,
  Button,
} from "../../components/ui";
import { parseGameDate } from "../../utils/gameDateInsights";
import { personalGenreNames, splitCsv } from "../../utils/gameList";
import { canDeleteGame, canEditGame } from "../../utils/permissions";
import { buildRankReorderRequest } from "../../utils/reorder";
import { formatAchievementSummary } from "../../utils/steamAchievements";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(value) {
  const parsed = parseGameDate(value);
  if (parsed) return dateFormatter.format(parsed.date);
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : dateFormatter.format(date);
}

function estimateHours(game) {
  const value = Number(game?.displayHLTB ?? game?.how_long_to_beat);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function scoreLabel(game) {
  if (game?.my_score === "" || game?.my_score == null) return "—";
  const score = Number(game.my_score);
  return Number.isFinite(score) ? `${score}/10` : "—";
}

function sortDirection(sortKey, activeSortKey, isReversed) {
  if (sortKey !== activeSortKey) return "none";
  return isReversed ? "descending" : "ascending";
}

function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  isReversed,
  onSort,
  className = "",
}) {
  return (
    <th
      scope="col"
      aria-sort={sortDirection(sortKey, activeSortKey, isReversed)}
      className={`sticky top-0 z-20 bg-surface-elevated/95 px-3 py-2 text-left backdrop-blur ${className}`}
    >
      <DataTableSortButton
        label={label}
        sortKey={sortKey}
        activeSortKey={activeSortKey}
        isReversed={isReversed}
        onSort={onSort}
      />
    </th>
  );
}

function GameActions({
  game,
  onEditGame,
  onDeleteGame,
  onFinishGame,
  onAddToNextUp,
}) {
  const { user, isAuthenticated } = useAuth();
  const { statusGroupOf } = useStatusGroups();
  const canEdit = canEditGame({ user, game, isAuthenticated });
  const canDelete = canDeleteGame({ user, game, isAuthenticated });
  const canFinish =
    canEdit &&
    onFinishGame &&
    String(game.status || "")
      .trim()
      .toLowerCase() !== "finished";
  const canQueue =
    canEdit &&
    onAddToNextUp &&
    !["playing", "done"].includes(statusGroupOf(game.status));

  if (!canEdit && !canDelete) {
    return <span className="text-content-muted">—</span>;
  }

  return (
    <ActionMenu
      label="More"
      ariaLabel={`Actions for ${game.name}`}
      className="h-10 bg-surface-elevated px-3 [&>span]:hidden"
    >
      {({ close }) => (
        <div className="space-y-1">
          {canFinish ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onFinishGame(game);
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-state-success hover:bg-state-success/10"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Finish game
            </button>
          ) : null}
          {canQueue ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onAddToNextUp(game);
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated"
            >
              <ListPlus className="h-4 w-4" aria-hidden="true" />
              Add to shortlist
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onEditGame(game);
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit game
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onDeleteGame(game.id);
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-state-error hover:bg-state-error/10"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete game
            </button>
          ) : null}
        </div>
      )}
    </ActionMenu>
  );
}

function SteamContext({ game }) {
  if (!game.steamOwned) return <span className="text-content-muted">—</span>;
  const playtime = Number(game.steamPlaytimeHours);
  const achievements = formatAchievementSummary(game.steamAchievements);

  return (
    <div className="min-w-0 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-integration-steam">
        <Gamepad2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {Number.isFinite(playtime) && playtime > 0
            ? `${playtime}h played`
            : "Owned on Steam"}
        </span>
      </div>
      {game.steamLastPlayedAt ? (
        <div className="mt-1 flex items-center gap-1.5 text-content-muted">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{formatDate(game.steamLastPlayedAt)}</span>
        </div>
      ) : null}
      {achievements?.isMeaningful ? (
        <div className="mt-1 flex items-center gap-1.5 text-content-muted">
          <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{achievements.compact}</span>
        </div>
      ) : null}
    </div>
  );
}

function BacklogTableRow({
  game,
  showSteam,
  showReorder,
  reorderEnabled,
  onSelectGame,
  onEditGame,
  onDeleteGame,
  onFinishGame,
  onAddToNextUp,
  collection,
  renderItemActions,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(game.id), disabled: !reorderEnabled });
  const genres = collection === "wishlist" || game.entryKind === "wishlist" ? splitCsv(game.genres) : personalGenreNames(game);
  const hours = estimateHours(game);

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.72 : 1,
        zIndex: isDragging ? 20 : undefined,
      }}
      className="group border-b border-surface-border/70 bg-surface-card transition-colors last:border-b-0 hover:bg-surface-hover"
    >
      {showReorder ? (
        <td className="w-11 px-2 py-3 text-center">
          <button
            type="button"
            {...(reorderEnabled ? attributes : {})}
            {...(reorderEnabled ? listeners : {})}
            disabled={!reorderEnabled}
            className="inline-flex h-9 w-9 touch-none items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface-selected hover:text-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={`Reorder ${game.name}`}
            title={
              reorderEnabled
                ? `Drag to reorder ${game.name}`
                : "Manual ordering is unavailable for the current sort or filters"
            }
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        </td>
      ) : null}
      <th scope="row" className="min-w-[280px] px-3 py-3 text-left">
        <button
          type="button"
          onClick={() => onSelectGame?.(game)}
          className="flex max-w-[340px] items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70"
        >
          <GameCover
            src={game.cover}
            name={game.name}
            alt={`${game.name || "Game"} cover`}
            decorative={false}
            className="h-16 w-11 shrink-0 rounded-lg border border-media-border/10 shadow-sm"
          />
          <span className="min-w-0">
            <span
              className="line-clamp-2 text-sm font-semibold leading-5 text-content-primary group-hover:text-primary-light"
              title={game.name}
            >
              {game.name}
            </span>
            {["main", "side"].includes(game.focusRole) ? (
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-light">
                {game.focusRole === "main" ? (
                  <Crown className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <CircleDot className="h-3 w-3" aria-hidden="true" />
                )}
                {game.focusRole}
              </span>
            ) : null}
            {game.releaseDate ? (
              <span className="mt-1 block truncate text-xs font-normal text-content-muted">
                Released {formatDate(game.releaseDate)}
              </span>
            ) : null}
          </span>
        </button>
        {collection !== "wishlist" && (game.steamPrice || game.wishlist?.steamPrice) ? (
          <div className="mt-2 max-w-[340px] font-normal"><SteamPrice price={game.steamPrice || game.wishlist?.steamPrice} /></div>
        ) : null}
      </th>
      {collection === "wishlist" ? (
        <td className="min-w-[130px] px-3 py-3">
          <SteamPrice price={game.steamPrice || game.wishlist?.steamPrice} />
        </td>
      ) : null}
      <td className="min-w-[170px] px-3 py-3">
        {collection === "wishlist" ? <span className="text-sm text-content-secondary">{game.steamActive && game.providerOrder != null ? game.providerOrder + 1 : "?"}</span> : <StatusBadge status={game.status} className="max-w-[180px]" />}
      </td>
      <td className="min-w-[210px] max-w-[250px] px-3 py-3">
        {genres.length ? (
          <AdaptiveChipList items={genres} maxLines={2} chipClassName="max-w-[120px] px-2 py-0.5" />
        ) : (
          <span className="text-content-muted">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold text-content-primary">
        {hours ? (
          `${hours}h`
        ) : (
          <span className="font-normal text-content-muted">TBD</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold text-content-primary">
        {collection === "wishlist" ? <>{game.rating != null ? `${game.rating}/5` : "N/A"}{game.metacritic != null ? <span className="block text-xs text-content-muted">Metacritic {game.metacritic}</span> : null}</> : scoreLabel(game)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-content-secondary">
        {formatDate(collection === "wishlist" ? game.dateAdded : game.started_at)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-content-secondary">
        {formatDate(collection === "wishlist" ? game.releaseDate : game.finished_at)}
      </td>
      {showSteam ? (
        <td className="min-w-[155px] px-3 py-3">
          <SteamContext game={game} />
        </td>
      ) : null}
      <td className="sticky right-0 z-10 w-[72px] border-l border-surface-border/80 bg-surface-card px-3 py-3 text-center shadow-[-10px_0_18px_-18px_rgb(var(--color-overlay))] transition-colors group-hover:bg-surface-hover">
        {renderItemActions ? renderItemActions(game) : game.entryKind === "wishlist" ? <Button size="sm" variant="ghost" onClick={() => onSelectGame?.(game)}>Wishlist</Button> : <GameActions
          game={game}
          onEditGame={onEditGame}
          onDeleteGame={onDeleteGame}
          onFinishGame={onFinishGame}
          onAddToNextUp={onAddToNextUp}
        />}
      </td>
    </tr>
  );
}

export default function BacklogTable({
  games = [],
  onSelectGame,
  onEditGame,
  onDeleteGame,
  onFinishGame,
  onAddToNextUp,
  onReorder,
  canManage = false,
  sortKey = "",
  setSortKey,
  isReversed = false,
  setIsReversed,
  collection = "backlog",
  renderItemActions,
}) {
  const [localGames, setLocalGames] = React.useState(games);
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

  const list = localGames.filter((game) => game?.name?.trim());
  const showSteam = list.some((game) => game.steamOwned);
  const showReorder = canManage;
  const reorderEnabled = Boolean(onReorder);

  const handleSort = (nextSortKey) => {
    if (sortKey === nextSortKey) {
      setIsReversed?.(!isReversed);
      return;
    }
    setSortKey?.(nextSortKey);
    setIsReversed?.(false);
  };

  const handleDragEnd = async ({ active, over }) => {
    if (!onReorder || !over || String(active.id) === String(over.id)) return;
    const request = buildRankReorderRequest(
      localGames,
      String(active.id),
      String(over.id),
    );
    if (!request) return;
    setLocalGames(request.newOrder);
    await onReorder(request.gameId, request.targetIndex);
  };

  return (
    <DataTableFrame className="max-h-[calc(100vh-var(--demo-banner-h,0px)-var(--backlog-toolbar-h,0px)-2rem)]">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={list.map((game) => String(game.id))}
          strategy={verticalListSortingStrategy}
        >
          <table
            className={`w-full ${collection === "wishlist" ? "min-w-[1380px]" : "min-w-[1260px]"} border-separate border-spacing-0`}
            aria-label={collection === "wishlist" ? "Wishlist table" : "Backlog table"}
          >
            <thead className="relative z-20">
              <tr className="border-b border-surface-border">
                {showReorder ? (
                  <th
                    scope="col"
                    className="sticky top-0 z-20 w-11 border-b border-surface-border bg-surface-elevated/95 px-2 py-2 backdrop-blur"
                  >
                    <span className="sr-only">Manual order</span>
                  </th>
                ) : null}
                <SortableHeader
                  label="Game"
                  sortKey="name"
                  activeSortKey={sortKey}
                  isReversed={isReversed}
                  onSort={handleSort}
                  className="min-w-[280px] border-b border-surface-border"
                />
                {collection === "wishlist" ? (
                  <SortableHeader
                    label="Price"
                    sortKey="price"
                    activeSortKey={sortKey}
                    isReversed={isReversed}
                    onSort={handleSort}
                    className="min-w-[130px] border-b border-surface-border"
                  />
                ) : null}
                <SortableHeader
                  label={collection === "wishlist" ? "Steam order" : "Status"}
                  sortKey={collection === "wishlist" ? "providerOrder" : "status"}
                  activeSortKey={sortKey}
                  isReversed={isReversed}
                  onSort={handleSort}
                  className="border-b border-surface-border"
                />
                <SortableHeader
                  label={collection === "wishlist" ? "Genres & tags" : "Personal genres"}
                  sortKey={collection === "wishlist" ? "genres" : "personalGenres"}
                  activeSortKey={sortKey}
                  isReversed={isReversed}
                  onSort={handleSort}
                  className="border-b border-surface-border"
                />
                <SortableHeader
                  label="Est. hours"
                  sortKey="estimatedHours"
                  activeSortKey={sortKey}
                  isReversed={isReversed}
                  onSort={handleSort}
                  className="border-b border-surface-border"
                />
                <SortableHeader
                  label={collection === "wishlist" ? "Rating" : "Score"}
                  sortKey={collection === "wishlist" ? "rawgRating" : "score"}
                  activeSortKey={sortKey}
                  isReversed={isReversed}
                  onSort={handleSort}
                  className="border-b border-surface-border"
                />
                <SortableHeader
                  label={collection === "wishlist" ? "Added" : "Started"}
                  sortKey={collection === "wishlist" ? "dateAdded" : "startedDate"}
                  activeSortKey={sortKey}
                  isReversed={isReversed}
                  onSort={handleSort}
                  className="border-b border-surface-border"
                />
                <SortableHeader
                  label={collection === "wishlist" ? "Released" : "Finished"}
                  sortKey={collection === "wishlist" ? "releaseDate" : "finishedDate"}
                  activeSortKey={sortKey}
                  isReversed={isReversed}
                  onSort={handleSort}
                  className="border-b border-surface-border"
                />
                {showSteam ? (
                  <SortableHeader
                    label="Steam"
                    sortKey="steamLastPlayed"
                    activeSortKey={sortKey}
                    isReversed={isReversed}
                    onSort={handleSort}
                    className="border-b border-surface-border"
                  />
                ) : null}
                <th
                  scope="col"
                  className="sticky right-0 top-0 z-30 w-[72px] border-b border-l border-surface-border bg-surface-elevated px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-content-muted shadow-[-10px_0_18px_-18px_rgb(var(--color-overlay))]"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((game) => (
                <BacklogTableRow
                  key={game.id}
                  game={game}
                  collection={collection}
                  renderItemActions={renderItemActions}
                  showSteam={showSteam}
                  showReorder={showReorder}
                  reorderEnabled={reorderEnabled}
                  onSelectGame={onSelectGame}
                  onEditGame={onEditGame}
                  onDeleteGame={onDeleteGame}
                  onFinishGame={onFinishGame}
                  onAddToNextUp={onAddToNextUp}
                />
              ))}
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
    </DataTableFrame>
  );
}
