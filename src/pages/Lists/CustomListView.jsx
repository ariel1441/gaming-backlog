import { useState } from "react";
import {
  CalendarDays,
  Clock3,
  GripVertical,
  Grid2X2,
  List,
  Plus,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  Button,
  Chip,
  GameCover,
  IconButton,
  SelectMenu,
} from "../../components/ui";
import {
  SMART_STATUS_OPTIONS,
  normalizeSmartQuery,
  smartListExposedControls,
  smartListGenres,
  smartListYears,
} from "../../utils/automaticLists";
import { hoursValueForList } from "../../utils/hours";
import { personalGenreNames } from "../../utils/gameList";
import { statusDisplayLabel } from "../../utils/statusDisplay";
import { formatUpdatedDate } from "./ListPreview";
import { GAME_ROW_COVER_SIZE } from "../../components/gameRowCoverStyles";
function moveItem(array, fromIndex, toIndex) {
  const next = [...array];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function gameCover(game) {
  return (
    game?.cover ||
    game?.cover_url ||
    game?.catalog_cover_url ||
    game?.rawg_cover ||
    ""
  );
}

function gameTitle(game) {
  return game?.displayName || game?.name || "Untitled game";
}

function controlOptionsWithCurrent(options, currentValue) {
  const current =
    currentValue == null || currentValue === "" ? "" : String(currentValue);
  if (!current || options.some((option) => option.value === current))
    return options;
  return [{ value: current, label: current }, ...options];
}

export function SmartQuickControls({ games, query, onChange }) {
  const controls = smartListExposedControls(query);
  if (!controls.length) return null;

  const finishedYearOptions = controlOptionsWithCurrent(
    smartListYears(games).map((year) => ({
      value: String(year),
      label: String(year),
    })),
    query.finishedYear,
  );
  const releaseYearOptions = controlOptionsWithCurrent(
    smartListYears(games, "release").map((year) => ({
      value: String(year),
      label: String(year),
    })),
    query.releasedYear,
  );
  const genreOptions = controlOptionsWithCurrent(
    smartListGenres(games).map((genre) => ({
      value: genre.value,
      label: genre.value,
    })),
    query.genre,
  );
  const maxHoursOptions = controlOptionsWithCurrent(
    [5, 10, 15, 20, 30, 50].map((value) => ({
      value: String(value),
      label: `${value}h`,
    })),
    query.maxHours,
  );
  const update = (patch) => onChange?.({ ...query, ...patch });

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {controls.includes("status") ? (
        <LabeledQuickSelect
          label="Status"
          value={query.status || ""}
          options={SMART_STATUS_OPTIONS.map((option) => ({
            value: option.value,
            label: option.value ? option.label : "Any",
          }))}
          onChange={(value) => update({ status: value || null })}
        />
      ) : null}
      {controls.includes("finishedYear") ? (
        <LabeledQuickSelect
          label="Year"
          value={query.finishedYear ? String(query.finishedYear) : ""}
          options={finishedYearOptions}
          onChange={(value) => update({ finishedYear: Number(value) })}
        />
      ) : null}
      {controls.includes("releasedYear") ? (
        <LabeledQuickSelect
          label="Release"
          value={query.releasedYear ? String(query.releasedYear) : ""}
          options={releaseYearOptions}
          onChange={(value) => update({ releasedYear: Number(value) })}
        />
      ) : null}
      {controls.includes("genre") ? (
        <LabeledQuickSelect
          label="Genre"
          value={query.genre || ""}
          options={genreOptions}
          onChange={(value) => update({ genre: value })}
        />
      ) : null}
      {controls.includes("maxHours") ? (
        <LabeledQuickSelect
          label="Max"
          value={query.maxHours == null ? "" : String(query.maxHours)}
          options={maxHoursOptions}
          onChange={(value) => update({ maxHours: Number(value) })}
        />
      ) : null}
    </div>
  );
}

function LabeledQuickSelect({ label, value, options, onChange }) {
  const labeledOptions = options.map((option) => ({
    ...option,
    buttonLabel: `${label}: ${option.label}`,
  }));

  return (
    <SelectMenu
      value={value}
      onChange={onChange}
      options={labeledOptions}
      className="min-w-40"
      buttonClassName="min-h-10 px-3 text-sm"
    />
  );
}

export function ListMeta({
  count,
  updatedAt,
  isSmart,
  ruleLabel,
  className = "",
}) {
  return (
    <div
      className={[
        "max-w-3xl text-sm leading-6 text-content-muted",
        className,
      ].join(" ")}
    >
      {count} {count === 1 ? "game" : "games"}
      {updatedAt ? ` - Updated ${formatUpdatedDate(updatedAt)}` : ""}
      {isSmart ? (
        <span className="block">{ruleLabel}</span>
      ) : (
        <span className="block">Ranked by you.</span>
      )}
    </div>
  );
}

export function ManualRankedList({
  games,
  viewMode,
  editable,
  disabled = false,
  onSelectGame,
  onRemoveGame,
  onReorder,
}) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (disabled) return;
    if (!over || active.id === over.id) return;
    const fromIndex = games.findIndex(
      (game) => String(game.id) === String(active.id),
    );
    const toIndex = games.findIndex(
      (game) => String(game.id) === String(over.id),
    );
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(moveItem(games, fromIndex, toIndex));
  };

  if (!editable) {
    return (
      <StaticRankedList
        games={games}
        viewMode={viewMode}
        onSelectGame={onSelectGame}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={viewMode === "rows" ? [restrictToVerticalAxis] : undefined}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext
        items={games.map((game) => String(game.id))}
        strategy={
          viewMode === "rows"
            ? verticalListSortingStrategy
            : rectSortingStrategy
        }
      >
        {viewMode === "rows" ? (
          <div className="space-y-2 overflow-x-clip">
            {games.map((game, index) => (
              <SortableRankedRow
                key={game.id}
                game={game}
                index={index}
                isDragging={activeId === String(game.id)}
                disabled={disabled}
                onSelect={() => onSelectGame(game)}
                onRemove={() => onRemoveGame(game.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-x-4 gap-y-7 overflow-x-clip grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {games.map((game, index) => (
              <SortablePosterCard
                key={game.id}
                game={game}
                index={index}
                isDragging={activeId === String(game.id)}
                disabled={disabled}
                onSelect={() => onSelectGame(game)}
                onRemove={() => onRemoveGame(game.id)}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </DndContext>
  );
}

export function StaticRankedList({ games, viewMode, onSelectGame }) {
  if (viewMode === "rows") {
    return (
      <div className="space-y-2">
        {games.map((game, index) => (
          <RankedRow
            key={game.id}
            game={game}
            index={index}
            onSelect={() => onSelectGame(game)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-x-4 gap-y-7 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {games.map((game, index) => (
        <PosterCard
          key={game.id}
          game={game}
          index={index}
          onSelect={() => onSelectGame(game)}
        />
      ))}
    </div>
  );
}

function SortablePosterCard({
  game,
  index,
  isDragging,
  disabled,
  onSelect,
  onRemove,
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: String(game.id), disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative min-w-0">
      <button
        type="button"
        className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-bg/85 text-content-muted shadow-panel hover:text-content-primary disabled:cursor-wait disabled:opacity-55"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <PosterCard game={game} index={index} onSelect={onSelect} />
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-bg/85 text-content-muted opacity-100 shadow-panel hover:text-state-error disabled:cursor-wait disabled:opacity-55 sm:opacity-0 sm:group-hover:opacity-100"
        title="Remove from list"
        aria-label={`Remove ${gameTitle(game)} from list`}
        disabled={disabled}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function PosterCard({ game, index, onSelect }) {
  const cover = gameCover(game);
  const title = gameTitle(game);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full min-w-0 text-left"
    >
      <GameCover
        src={cover}
        name={title}
        variant="poster"
        className="w-full rounded-md bg-surface-card shadow-panel ring-1 ring-surface-border transition-colors hover:ring-primary/45"
      />
      <div className="mt-1.5 text-center text-sm font-semibold text-content-primary">
        {index + 1}
      </div>
      <div
        className="mt-1 truncate text-center text-xs text-content-muted"
        title={title}
      >
        {title}
      </div>
    </button>
  );
}

function SortableRankedRow({
  game,
  index,
  isDragging,
  disabled,
  onSelect,
  onRemove,
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: String(game.id), disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <RankedRow
        game={game}
        index={index}
        onSelect={onSelect}
        dragHandle={
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-content-muted hover:bg-surface-elevated hover:text-content-primary disabled:cursor-wait disabled:opacity-55"
            title="Drag to reorder"
            aria-label="Drag to reorder"
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" aria-hidden="true" />
          </button>
        }
        trailing={
          <IconButton
            icon={X}
            label={`Remove ${gameTitle(game)} from list`}
            title="Remove"
            variant="ghost"
            onClick={onRemove}
            disabled={disabled}
          />
        }
      />
    </div>
  );
}

function yearFromDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? String(date.getFullYear())
    : "";
}

function compactDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function scoreLabel(game) {
  const score = Number(game?.my_score);
  return Number.isFinite(score) && score > 0 ? `${score}/10` : "";
}

function hoursLabel(game) {
  const hours = Number(hoursValueForList(game));
  if (!Number.isFinite(hours) || hours <= 0) return "";
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function rowGenres(game) {
  return personalGenreNames(game).map((label) => ({
    label,
    variant: "personalGenre",
  }));
}

function MetaPill({ icon: Icon, children }) {
  if (!children) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-surface-border bg-surface-bg/55 px-2.5 py-1 text-xs font-medium text-content-secondary">
      <Icon
        className="h-3.5 w-3.5 shrink-0 text-content-muted"
        aria-hidden="true"
      />
      <span className="truncate">{children}</span>
    </span>
  );
}

function RankedRow({
  game,
  index,
  onSelect,
  dragHandle = null,
  trailing = null,
}) {
  const cover = gameCover(game);
  const title = gameTitle(game);
  const releaseYear = yearFromDate(
    game?.releaseDate || game?.released || game?.released_at,
  );
  const finishedDate = compactDate(game?.finished_at);
  const startedDate = compactDate(game?.started_at);
  const genres = rowGenres(game);

  return (
    <div className="group relative flex min-w-0 items-stretch gap-3 overflow-hidden rounded-2xl border border-surface-border bg-surface-card">
      <GameCover
        src={cover}
        name={title}
        className="pointer-events-none absolute inset-0 h-full w-full"
        imageClassName="opacity-[0.08] blur-sm"
        fallbackClassName="opacity-[0.08]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-surface-card via-surface-card/95 to-surface-card/75" />
      {dragHandle}
      <div className="relative z-10 flex w-12 shrink-0 items-center justify-center text-xl font-semibold text-content-primary sm:w-14">
        {index + 1}.
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="relative z-10 flex min-w-0 flex-1 items-center gap-5 p-3 text-left transition-colors hover:bg-surface-elevated/25"
      >
        <GameCover
          src={cover}
          name={title}
          className={`${GAME_ROW_COVER_SIZE} shrink-0 rounded-xl ring-1 ring-surface-border`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <div
              className="min-w-0 max-w-full truncate text-lg font-semibold text-content-primary"
              title={title}
            >
              {title}
            </div>
            {releaseYear ? (
              <span className="shrink-0 text-sm text-content-muted">
                {releaseYear}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap gap-2">
            <MetaPill icon={Star}>{scoreLabel(game)}</MetaPill>
            <MetaPill icon={Clock3}>{hoursLabel(game)}</MetaPill>
            <MetaPill icon={Tag}>{statusDisplayLabel(game.status)}</MetaPill>
            <MetaPill icon={CalendarDays}>
              {finishedDate
                ? `Finished ${finishedDate}`
                : startedDate
                  ? `Started ${startedDate}`
                  : ""}
            </MetaPill>
          </div>
          {genres.length ? (
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
              {genres.map((genre) => (
                <Chip
                  key={`${genre.variant}-${genre.label}`}
                  variant={genre.variant}
                  title={genre.label}
                  className="truncate px-2 py-0.5"
                >
                  {genre.label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      </button>
      {trailing ? (
        <div className="relative z-10 flex items-center pr-3">{trailing}</div>
      ) : null}
    </div>
  );
}

export function CandidateRow({ game, adding, disabled, onAdd }) {
  const cover = gameCover(game);
  const title = gameTitle(game);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-surface-border bg-surface-bg/35 p-2">
      <GameCover
        src={cover}
        name={title}
        className="h-14 w-10 shrink-0 rounded"
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-semibold text-content-primary"
          title={title}
        >
          {title}
        </div>
        <div className="mt-1 truncate text-xs text-content-muted">
          {statusDisplayLabel(game.status) || "No status"}
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={onAdd}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {adding ? "Adding..." : "Add"}
      </Button>
    </div>
  );
}
