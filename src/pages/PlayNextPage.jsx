import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  Crown,
  GripVertical,
  LibraryBig,
  ListPlus,
  MoveDown,
  MoveUp,
  Play,
  Search,
  Shuffle,
  StickyNote,
  Trash2,
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Link, useSearchParams } from "react-router-dom";
import GameModal from "../components/GameModal";
import { AppPage, PageError, PageHeader } from "../components/layout";
import {
  ActionMenu,
  Button,
  Chip,
  EmptyState,
  GameCover,
  Modal,
  Panel,
  SectionHeader,
  SelectMenu,
  Sheet,
  Skeleton,
  StatusBadge,
  Textarea,
  TextInput,
  useConfirm,
  useToast,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useStatusGroups } from "../contexts/StatusGroupsContext";
import { useGames } from "../hooks/useGames";
import { useStatuses } from "../hooks/useStatuses";
import {
  addToNextUp,
  assignPlayFocus,
  getNextUp,
  removePlayFocus,
  removeFromNextUp,
  reorderNextUp,
  startPlaying,
} from "../services/nextUpService";
import {
  focusRoleCandidates,
  focusSuggestionGroups,
  moveQueueItem,
  playNextStatusGroup,
  recommendationCandidates,
  surprisePool,
} from "../utils/playNext";
import { personalGenreNames } from "../utils/gameList";
import { resolveGameHours } from "../utils/hours";
import { statusDisplayLabel } from "../utils/statusDisplay";
import { apiErrorMessage, buildEditGamePayload } from "./Backlog/backlogForm";

const FOCUSED_QUEUE_LIMIT = 10;
const EMPTY_FOCUS = Object.freeze({ main: null, side: null, occasional: [] });
const EMPTY_CANDIDATES = Object.freeze({ main: [], side: [] });

function titleOf(game) {
  return game?.displayName || game?.name || "Untitled game";
}

function knownHours(game) {
  const hours = Number(resolveGameHours(game).hours);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function steamLaunchUrl(game) {
  const appId = String(game?.steamAppId || "").trim();
  return /^\d+$/.test(appId) ? `steam://run/${appId}` : "";
}

function openSteam(game, toast) {
  const url = steamLaunchUrl(game);
  if (!url) {
    toast.info("This game is ready. Open it from its launcher.");
    return false;
  }
  window.location.assign(url);
  return true;
}

function privateUpdatePayload(game, patch = {}) {
  return {
    name: game.name,
    status: game.status,
    my_genre: game.my_genre || "",
    thoughts: game.thoughts || "",
    my_score: game.my_score ?? null,
    how_long_to_beat: game.how_long_to_beat ?? null,
    hours_preferred_source: game.hours_preferred_source || "auto",
    hours_locked: !!game.hours_locked,
    ...(game.rawg_id !== undefined ? { rawg_id: game.rawg_id } : {}),
    ...(game.rawg_slug !== undefined ? { rawg_slug: game.rawg_slug } : {}),
    ...patch,
  };
}

function PlayNextSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading Play Next">
      <div className="space-y-3 border-b border-surface-border pb-5">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-56 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-36 rounded-2xl" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function RecommendationCard({
  pick,
  returning,
  continuing,
  onStart,
  onContinue,
  onDismiss,
}) {
  return (
    <Panel className="min-w-0" bodyClassName="p-3 sm:p-4">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
        <GameCover
          src={pick.game.cover}
          name={titleOf(pick.game)}
          className="aspect-video w-full shrink-0 rounded-xl border border-media-border/10 shadow-lg sm:w-48"
          showFallbackLabel
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-light">
            {pick.title}
          </div>
          <h3
            className="mt-1 line-clamp-2 text-lg font-semibold text-content-primary"
            title={titleOf(pick.game)}
          >
            {titleOf(pick.game)}
          </h3>
          <p className="mt-1 text-sm leading-5 text-content-muted">
            {pick.reason}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={() =>
            continuing ? onContinue(pick.game) : onStart(pick.game)
          }
        >
          {continuing ? (
            <StickyNote className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          {continuing
            ? pick.game.resume_note
              ? "View Next time"
              : "Add Next time"
            : returning
              ? "Resume playing"
              : "Start playing"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Show another
        </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function GameRowBackdrop({ game }) {
  if (!game.cover) return null;
  return (
    <>
      <GameCover
        src={game.cover}
        name={titleOf(game)}
        decorative
        className="absolute inset-0 h-full w-full"
        imageClassName="opacity-30"
        fallbackClassName="opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-surface-card via-surface-card/95 to-surface-card/75" />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-card/65 via-transparent to-transparent" />
    </>
  );
}

function PersonalGenres({ game }) {
  const genres = personalGenreNames(game);
  if (!genres.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {genres.map((genre) => (
        <Chip key={genre} variant="personalGenre" className="truncate">
          {genre}
        </Chip>
      ))}
    </div>
  );
}

function QueueRow({
  game,
  index,
  count,
  saving,
  reorderDisabled,
  returning,
  candidateRole,
  onStart,
  onMove,
  onChangeRole,
  onRemove,
  onOpen,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(game.id), disabled: saving || reorderDisabled });
  const hours = knownHours(game);
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
      }}
      className="relative min-w-0 overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-sm"
    >
      <GameRowBackdrop game={game} />
      <div className="relative flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <button
            type="button"
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-control text-content-muted hover:bg-surface-elevated hover:text-content-primary disabled:opacity-50 sm:flex"
            aria-label={`Drag ${titleOf(game)} to reorder`}
            title="Drag to reorder"
            disabled={saving || reorderDisabled}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-lg font-semibold text-primary-light">
            {index + 1}
          </div>
          <button
            type="button"
            onClick={() => onOpen(game)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70"
          >
            <GameCover
              src={game.cover}
              name={titleOf(game)}
              className="h-24 w-36 shrink-0 rounded-xl border border-media-border/10 shadow-lg sm:h-32 sm:w-56"
            />
            <div className="min-w-0">
              <h3 className="line-clamp-2 break-words font-semibold text-content-primary">
                {titleOf(game)}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={game.status} />
                <span className="text-xs text-content-muted">
                  {hours == null ? "Duration unknown" : `About ${hours}h`}
                </span>
              </div>
              <div className="mt-2">
                <PersonalGenres game={game} />
              </div>
            </div>
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => onStart(game)}
            disabled={saving}
            className="min-w-0 flex-1 sm:flex-none"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {returning ? "Resume playing" : "Start playing"}
          </Button>
          <ActionMenu
            label="More"
            ariaLabel={`More actions for ${titleOf(game)}`}
            disabled={saving}
            className="[&>span]:hidden"
          >
            {({ close }) => (
              <div className="space-y-1">
                {[
                  ["top", "Move to top", ChevronUp, index === 0],
                  ["up", "Move up", MoveUp, index === 0],
                  ["down", "Move down", MoveDown, index === count - 1],
                ].map(([destination, label, Icon, actionDisabled]) => (
                  <button
                    key={destination}
                    type="button"
                    role="menuitem"
                    disabled={actionDisabled || reorderDisabled}
                    onClick={() => {
                      close();
                      onMove(game.id, destination);
                    }}
                    className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated disabled:opacity-45"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onChangeRole(game, candidateRole === "main" ? "side" : "main");
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated"
                >
                  <ListPlus className="h-4 w-4" aria-hidden="true" />
                  Move to {candidateRole === "main" ? "Side" : "Main"} candidates
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onRemove(game.id);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-state-error hover:bg-state-error/10"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remove
                </button>
              </div>
            )}
          </ActionMenu>
        </div>
      </div>
    </div>
  );
}

function ReturningRow({ game, busy, onAdd, onNote, onOpen }) {
  const note = String(game.resume_note || "").trim();
  return (
    <article className="relative min-w-0 overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-sm">
      <GameRowBackdrop game={game} />
      <div className="relative flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <button
          type="button"
          onClick={() => onOpen(game)}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70"
        >
          <GameCover
            src={game.cover}
            name={titleOf(game)}
            className="h-24 w-36 shrink-0 rounded-xl border border-media-border/10 shadow-lg sm:h-32 sm:w-56"
          />
          <div className="min-w-0">
            <h3 className="line-clamp-2 break-words text-lg font-semibold text-content-primary">
              {titleOf(game)}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={game.status} />
              <PersonalGenres game={game} />
            </div>
            {note ? (
              <p className="mt-3 line-clamp-2 whitespace-pre-line break-words text-sm text-content-secondary">
                <span className="font-semibold text-content-primary">
                  Next time:{" "}
                </span>
                {note}
              </p>
            ) : null}
          </div>
        </button>
        <div className="flex flex-col gap-2 sm:items-end">
          <Button
            type="button"
            variant="primary"
            onClick={() => onAdd(game)}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            Add to candidates
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onNote(game)}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            <StickyNote className="h-4 w-4" aria-hidden="true" />
            {note ? "Edit Next time" : "Add Next time"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function FocusPickerRow({ candidate, busy, onChoose }) {
  const { game, fitLabel, reason, sourceLabel } = candidate;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-surface-border bg-surface-bg/40 p-2">
      <GameCover
        src={game.cover}
        name={titleOf(game)}
        className="h-16 w-11 shrink-0 rounded-md"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-content-primary">
          {titleOf(game)}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Chip variant="primary" className="px-2 py-0.5">
            {fitLabel}
          </Chip>
          <Chip className="px-2 py-0.5">{sourceLabel}</Chip>
        </div>
        <div className="mt-1.5 line-clamp-2 text-xs text-content-muted">
          {reason}
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChoose(game)}
        disabled={busy}
      >
        Choose
      </Button>
    </div>
  );
}

function FocusSlotCard({
  role,
  game,
  busy,
  onChoose,
  onPlay,
  onNote,
  onOpen,
  onClear,
}) {
  const isMain = role === "main";
  const label = isMain ? "Main game" : "Side game";
  const Icon = isMain ? Crown : CircleDot;
  if (!game) {
    return (
      <Panel bodyClassName="flex h-full min-h-64 flex-col items-center justify-center p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary-light">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-lg font-semibold text-content-primary">
          Choose your {label.toLowerCase()}
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-content-muted">
          {isMain
            ? "The game you want to make steady progress in."
            : "A contrasting game that is easier to fit around your main game."}
        </p>
        <Button
          type="button"
          variant="primary"
          className="mt-5"
          onClick={onChoose}
        >
          Choose {isMain ? "Main" : "Side"}
        </Button>
      </Panel>
    );
  }

  const note = String(game.resume_note || "").trim();
  const active =
    String(game.status || "")
      .trim()
      .toLowerCase() === "playing";
  return (
    <Panel
      className="min-w-0 overflow-hidden"
      bodyClassName="flex h-full flex-col p-0"
    >
      <button
        type="button"
        onClick={() => onOpen(game)}
        className="relative block min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70"
      >
        <GameCover
          src={game.cover}
          name={titleOf(game)}
          className="aspect-video w-full border-b border-media-border/10"
          showFallbackLabel
        />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-surface-bg/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary-light shadow-md backdrop-blur">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </span>
      </button>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-xl font-semibold text-content-primary">
              {titleOf(game)}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={game.status} />
              {game.steamLastPlayedAt ? (
                <span className="text-xs text-content-muted">
                  Last played{" "}
                  {new Date(game.steamLastPlayedAt).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          </div>
          <ActionMenu
            label="More"
            ariaLabel={`More actions for ${titleOf(game)}`}
          >
            {({ close }) => (
              <div className="space-y-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onNote(game);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated"
                >
                  <StickyNote className="h-4 w-4" aria-hidden="true" />
                  {note ? "Edit Next time" : "Add Next time"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onChoose();
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated"
                >
                  Replace {label.toLowerCase()}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onClear(game);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-state-error hover:bg-state-error/10"
                >
                  Clear slot
                </button>
              </div>
            )}
          </ActionMenu>
        </div>
        {note ? (
          <p className="mt-4 line-clamp-3 whitespace-pre-line rounded-xl border border-surface-border bg-surface-bg/45 p-3 text-sm leading-6 text-content-secondary">
            <span className="font-semibold text-content-primary">
              Next time:{" "}
            </span>
            {note}
          </p>
        ) : null}
        <div className="mt-auto pt-5">
          <Button
            type="button"
            variant="primary"
            className="w-full"
            onClick={() => onPlay(game)}
            disabled={busy}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {active ? "Let’s play for 10 minutes" : "Yes, let’s start"}
          </Button>
          <p className="mt-2 text-center text-xs text-content-muted">
            Starting is the goal. You can stop after ten minutes.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function OtherActiveRow({
  game,
  busy,
  occasional,
  onPlay,
  onAssign,
  onClear,
  onNote,
  onOpen,
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-2xl border border-surface-border bg-surface-card p-3 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={() => onOpen(game)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70"
      >
        <GameCover
          src={game.cover}
          name={titleOf(game)}
          className="h-20 w-32 shrink-0 rounded-lg"
        />
        <span className="min-w-0">
          <span className="line-clamp-2 font-semibold text-content-primary">
            {titleOf(game)}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
            <StatusBadge status={game.status} />
            {occasional ? (
              <span>Occasional</span>
            ) : (
              <span>Active outside your focus slots</span>
            )}
          </span>
        </span>
      </button>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onPlay(game)}
          disabled={busy}
        >
          Play
        </Button>
        <ActionMenu
          label="More"
          ariaLabel={`Focus options for ${titleOf(game)}`}
        >
          {({ close }) => (
            <div className="space-y-1">
              {["main", "side"].map((role) => (
                <button
                  key={role}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onAssign(game, role);
                  }}
                  className="flex min-h-11 w-full items-center rounded-control px-3 py-2 text-left text-sm capitalize text-content-secondary hover:bg-surface-elevated"
                >
                  Make {role}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  if (occasional) onClear(game);
                  else onAssign(game, "occasional");
                }}
                className="flex min-h-11 w-full items-center rounded-control px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated"
              >
                {occasional ? "Remove occasional" : "Keep as occasional"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onNote(game);
                }}
                className="flex min-h-11 w-full items-center rounded-control px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated"
              >
                Edit Next time
              </button>
            </div>
          )}
        </ActionMenu>
      </div>
    </article>
  );
}

export default function PlayNextPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { statusGroupOf } = useStatusGroups();
  const {
    games,
    loading: gamesLoading,
    error: gamesError,
    editGame,
    removeGame: deleteGame,
    refresh,
    upsertGame,
  } = useGames();
  const { statuses } = useStatuses();
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [queueIds, setQueueIds] = useState([]);
  const [candidateBanks, setCandidateBanks] = useState(EMPTY_CANDIDATES);
  const [focus, setFocus] = useState(EMPTY_FOCUS);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addingRole, setAddingRole] = useState("main");
  const [addSearch, setAddSearch] = useState("");
  const [noteGame, setNoteGame] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [activeOpen, setActiveOpen] = useState(false);
  const [assigningRole, setAssigningRole] = useState("");
  const [showAllFocusCandidates, setShowAllFocusCandidates] = useState(false);
  const [returningOpen, setReturningOpen] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [randomPickId, setRandomPickId] = useState(null);
  const [dismissed, setDismissed] = useState({
    priority: new Set(),
    quick: new Set(),
    continue: new Set(),
  });

  const loadQueue = useCallback(async () => {
    if (!isAuthenticated) {
      setQueueIds([]);
      setCandidateBanks(EMPTY_CANDIDATES);
      setFocus(EMPTY_FOCUS);
      setQueueLoading(false);
      setQueueError(null);
      return;
    }
    setQueueLoading(true);
    setQueueError(null);
    try {
      const payload = await getNextUp();
      setQueueIds(Array.isArray(payload?.gameIds) ? payload.gameIds : []);
      setCandidateBanks(
        payload?.candidates || {
          main: Array.isArray(payload?.gameIds) ? payload.gameIds : [],
          side: [],
        },
      );
      setFocus(payload?.focus || EMPTY_FOCUS);
    } catch (error) {
      setQueueError(error);
    } finally {
      setQueueLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (queueLoading) return;
    const role = searchParams.get("choose");
    if (!["main", "side"].includes(role)) return;
    setAssigningRole(role);
    setAddOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("choose");
    setSearchParams(next, { replace: true });
  }, [queueLoading, searchParams, setSearchParams]);

  const byId = useMemo(
    () => new Map(games.map((game) => [String(game.id), game])),
    [games],
  );
  const queueGames = useMemo(
    () => queueIds.map((id) => byId.get(String(id))).filter(Boolean),
    [byId, queueIds],
  );
  const mainCandidateGames = useMemo(
    () => (candidateBanks.main || []).map((id) => byId.get(String(id))).filter(Boolean),
    [byId, candidateBanks.main],
  );
  const sideCandidateGames = useMemo(
    () => (candidateBanks.side || []).map((id) => byId.get(String(id))).filter(Boolean),
    [byId, candidateBanks.side],
  );
  const activeGames = useMemo(
    () =>
      games.filter(
        (game) => playNextStatusGroup(game.status, statusGroupOf) === "playing",
      ),
    [games, statusGroupOf],
  );
  const mainGame = byId.get(String(focus.main)) || null;
  const sideGame = byId.get(String(focus.side)) || null;
  const focusedIds = useMemo(
    () => new Set([focus.main, focus.side].filter(Boolean).map(String)),
    [focus.main, focus.side],
  );
  const occasionalIds = useMemo(
    () => new Set((focus.occasional || []).map(String)),
    [focus.occasional],
  );
  const otherActiveGames = useMemo(
    () => activeGames.filter((game) => !focusedIds.has(String(game.id))),
    [activeGames, focusedIds],
  );
  const queueSet = useMemo(
    () => new Set(queueIds.map((id) => String(id))),
    [queueIds],
  );
  const addCandidates = useMemo(() => {
    const query = addSearch.trim().toLowerCase();
    return games
      .filter(
        (game) =>
          !queueSet.has(String(game.id)) &&
          !["playing", "done"].includes(
            playNextStatusGroup(game.status, statusGroupOf),
          ) &&
          (!query || titleOf(game).toLowerCase().includes(query)),
      )
      .sort((a, b) => {
        const soonA =
          String(a.status).toLowerCase() === "plan to play soon" ? 0 : 1;
        const soonB =
          String(b.status).toLowerCase() === "plan to play soon" ? 0 : 1;
        const hoursA = knownHours(a) ?? Number.POSITIVE_INFINITY;
        const hoursB = knownHours(b) ?? Number.POSITIVE_INFINITY;
        return soonA - soonB || hoursA - hoursB || Number(a.id) - Number(b.id);
      });
  }, [addSearch, games, queueSet, statusGroupOf]);
  const focusCandidates = useMemo(() => {
    const eligible = games.filter(
        (game) =>
          !focusedIds.has(String(game.id)) &&
          String(game.status || "")
            .trim()
            .toLowerCase() !== "wishlist" &&
          playNextStatusGroup(game.status, statusGroupOf) !== "done",
      );
    return focusRoleCandidates({
      games: eligible,
      role: assigningRole || "side",
      partnerGame: assigningRole === "main" ? sideGame : mainGame,
      queueIds: candidateBanks[assigningRole] || [],
      statusGroupOf,
    });
  }, [assigningRole, candidateBanks, focusedIds, games, mainGame, sideGame, statusGroupOf]);
  const focusGroups = useMemo(
    () => focusSuggestionGroups({
      candidates: focusCandidates,
      queueIds: candidateBanks[assigningRole] || [],
    }),
    [assigningRole, candidateBanks, focusCandidates],
  );
  const genreOptions = useMemo(() => {
    const labels = new Map();
    games.forEach((game) => {
      personalGenreNames(game).forEach((genre) => {
        const key = genre.toLowerCase();
        if (!labels.has(key)) labels.set(key, genre);
      });
    });
    return [...labels.values()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [games]);
  const queueEntries = useMemo(
    () => [
      ...mainCandidateGames.map((game, index) => ({ game, index, role: "main" })),
      ...sideCandidateGames.map((game, index) => ({ game, index, role: "side" })),
    ],
    [mainCandidateGames, sideCandidateGames],
  );
  const returningGames = useMemo(
    () =>
      games
        .filter(
          (game) =>
            playNextStatusGroup(game.status, statusGroupOf) === "returning" &&
            !queueSet.has(String(game.id)),
        )
        .sort((a, b) => Number(a.id) - Number(b.id)),
    [games, queueSet, statusGroupOf],
  );
  const picks = useMemo(
    () =>
      recommendationCandidates({
        games,
        queueIds,
        statusGroupOf,
        dismissed,
        selectedGenres,
      }),
    [dismissed, games, queueIds, selectedGenres, statusGroupOf],
  );

  const chooseGenre = (value) => {
    setSelectedGenres(value ? [value] : []);
    setRandomPickId(null);
    setDismissed({
      priority: new Set(),
      quick: new Set(),
      continue: new Set(),
    });
  };

  const showAnotherMoodPick = (pick) => {
    setDismissed((current) => ({
      ...current,
      priority: new Set([...current.priority, pick.game.id]),
    }));
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const applyCandidatePayload = (payload, fallbackBanks = candidateBanks) => {
    if (payload?.candidates) setCandidateBanks(payload.candidates);
    else setCandidateBanks(fallbackBanks);
    if (Array.isArray(payload?.gameIds)) setQueueIds(payload.gameIds);
  };

  const saveOrder = async (nextIds, previousIds, role) => {
    if (nextIds.every((id, index) => String(id) === String(previousIds[index])))
      return;
    setCandidateBanks((current) => ({ ...current, [role]: nextIds }));
    setBusy(true);
    try {
      const payload = await reorderNextUp(nextIds, role);
      applyCandidatePayload(payload, { ...candidateBanks, [role]: nextIds });
    } catch (error) {
      setCandidateBanks((current) => ({ ...current, [role]: previousIds }));
      toast.error(error.message || "Could not save the queue order.");
      await loadQueue();
    } finally {
      setBusy(false);
    }
  };

  const moveGame = (gameId, destination, role) => {
    const previous = [...(candidateBanks[role] || [])];
    void saveOrder(moveQueueItem(previous, gameId, destination), previous, role);
  };

  const addGame = async (game, role = addingRole) => {
    setBusy(true);
    try {
      const payload = await addToNextUp(game.id, role);
      applyCandidatePayload(payload);
      toast.success(
        `${titleOf(game)} added to your ${role} candidates.`,
      );
    } catch (error) {
      toast.error(error.message || "Could not add this game to the candidate bank.");
    } finally {
      setBusy(false);
    }
  };

  const assignFocus = async (game, role) => {
    setBusy(true);
    try {
      const previousId = role === "main" || role === "side" ? focus[role] : null;
      const payload = await assignPlayFocus(role, game.id);
      setFocus(payload.focus || EMPTY_FOCUS);
      applyCandidatePayload(payload);
      if (previousId && String(previousId) !== String(game.id)) {
        const previousGame = byId.get(String(previousId));
        if (previousGame) upsertGame({ ...previousGame, focusRole: null });
      }
      upsertGame({ ...game, focusRole: role });
      setAddOpen(false);
      setAddSearch("");
      setAssigningRole("");
      setShowAllFocusCandidates(false);
      toast.success(
        role === "occasional"
          ? `${titleOf(game)} is now an occasional game.`
          : `${titleOf(game)} is now your ${role} game.`,
      );
    } catch (error) {
      toast.error(error.message || "Could not update your focus games.");
      await loadQueue();
    } finally {
      setBusy(false);
    }
  };

  const clearFocus = async (game) => {
    setBusy(true);
    try {
      const payload = await removePlayFocus(game.id);
      setFocus(payload.focus || EMPTY_FOCUS);
      upsertGame({ ...game, focusRole: null });
      toast.success(`${titleOf(game)} was removed from your focus.`);
    } catch (error) {
      toast.error(error.message || "Could not clear this focus slot.");
      await loadQueue();
    } finally {
      setBusy(false);
    }
  };

  const openFocusPicker = (role) => {
    setAssigningRole(role);
    setShowAllFocusCandidates(false);
    setAddSearch("");
    setAddOpen(true);
  };

  const removeGame = async (gameId) => {
    const previous = [...queueIds];
    setQueueIds((current) =>
      current.filter((id) => String(id) !== String(gameId)),
    );
    setBusy(true);
    try {
      const payload = await removeFromNextUp(gameId);
      applyCandidatePayload(payload);
      toast.success("Removed from the candidate bank.");
    } catch (error) {
      setQueueIds(previous);
      toast.error(error.message || "Could not remove this game.");
    } finally {
      setBusy(false);
    }
  };

  const deleteSelectedGame = async (game) => {
    const approved = await confirm({
      title: "Delete game?",
      message: "This removes the game from your backlog.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!approved) return;
    setBusy(true);
    try {
      await deleteGame(game.id);
      setQueueIds((current) =>
        current.filter((id) => String(id) !== String(game.id)),
      );
      setSelectedGame(null);
      setFocus((current) => ({
        main: String(current.main) === String(game.id) ? null : current.main,
        side: String(current.side) === String(game.id) ? null : current.side,
        occasional: (current.occasional || []).filter(
          (id) => String(id) !== String(game.id),
        ),
      }));
      toast.success("Game deleted.");
    } catch (error) {
      toast.error(error.message || "Could not delete this game.");
    } finally {
      setBusy(false);
    }
  };

  const startGame = async (game) => {
    const returning =
      playNextStatusGroup(game.status, statusGroupOf) === "returning";
    const approved = await confirm({
      title: `${returning ? "Resume" : "Start"} ${titleOf(game)}?`,
      message: game.started_at
        ? `Status will change to Playing. Your existing start date (${String(game.started_at).slice(0, 10)}) will be kept, and the game will leave the shortlist.`
        : "Status will change to Playing, today's date will be recorded as the start date, and the game will leave the shortlist.",
      confirmLabel: returning ? "Resume playing" : "Start playing",
      tone: "primary",
    });
    if (!approved) return;
    setBusy(true);
    try {
      const payload = await startPlaying(game.id);
      applyCandidatePayload(payload);
      if (payload.game) {
        upsertGame(payload.game);
        setSelectedGame((current) =>
          current?.id === payload.game.id ? payload.game : current,
        );
      }
      toast.success(`${titleOf(game)} is now Playing. Steam should open next.`);
      openSteam(payload.game || game, toast);
    } catch (error) {
      toast.error(error.message || "Could not start this game.");
      await loadQueue();
    } finally {
      setBusy(false);
    }
  };

  const playGame = (game) => {
    if (playNextStatusGroup(game.status, statusGroupOf) === "playing") {
      openSteam(game, toast);
      return;
    }
    void startGame(game);
  };

  const openNote = (game) => {
    setNoteGame(game);
    setNoteDraft(game.resume_note || "");
  };

  const saveNote = async () => {
    if (!noteGame) return;
    setBusy(true);
    try {
      const updated = await editGame(
        noteGame.id,
        privateUpdatePayload(noteGame, { resume_note: noteDraft }),
      );
      const next = updated || {
        ...noteGame,
        resume_note: noteDraft.trim() || null,
      };
      setNoteGame(null);
      setSelectedGame((current) =>
        current?.id === next.id ? { ...current, ...next } : current,
      );
      toast.success(
        noteDraft.trim() ? "Next time note saved." : "Next time note cleared.",
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save the Next time note."));
    } finally {
      setBusy(false);
    }
  };

  const editFromModal = async (draft) => {
    const original = byId.get(String(draft.id)) || selectedGame || {};
    const result = buildEditGamePayload(draft, original);
    if (!result.ok) {
      toast.warning(result.message);
      return { ok: false };
    }
    try {
      const updated = await editGame(original.id, result.payload);
      setSelectedGame(updated);
      if (
        ["playing", "done"].includes(
          playNextStatusGroup(updated.status, statusGroupOf),
        )
      ) {
        setQueueIds((current) =>
          current.filter((id) => String(id) !== String(updated.id)),
        );
      }
      if (
        ["returning", "done"].includes(
          playNextStatusGroup(updated.status, statusGroupOf),
        ) || String(updated.status || "").trim().toLowerCase() === "wishlist"
      ) {
        setFocus((current) => ({
          main:
            String(current.main) === String(updated.id) ? null : current.main,
          side:
            String(current.side) === String(updated.id) ? null : current.side,
          occasional: (current.occasional || []).filter(
            (id) => String(id) !== String(updated.id),
          ),
        }));
      }
      toast.success("Game updated.");
      return { ok: true, game: updated };
    } catch (error) {
      toast.error(error.message || "Could not update this game.");
      return { ok: false };
    }
  };

  const surprise = () => {
    const pool = surprisePool({
      pool: "backlog",
      games,
      queueIds,
      statusGroupOf,
      selectedGenres,
    }).filter((game) => String(game.id) !== String(randomPickId));
    if (!pool.length) {
      toast.info(
        selectedGenres.length
          ? "No other backlog games match your current vibe."
          : "No other eligible backlog games are available.",
      );
      return;
    }
    setRandomPickId(pool[Math.floor(Math.random() * pool.length)].id);
  };

  if (authLoading || gamesLoading || queueLoading) {
    return (
      <AppPage width="wide">
        <PlayNextSkeleton />
      </AppPage>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppPage width="standard">
        <EmptyState
          icon={Play}
          title="Sign in to plan what to play next."
          description="Your Next Up shortlist and Next time notes are private to your account. You can also try the writable demo from the Backlog page."
          action={
            <Button as={Link} to="/" variant="primary">
              Go to Backlog
            </Button>
          }
        />
      </AppPage>
    );
  }

  if (gamesError || queueError) {
    const error = queueError || gamesError;
    return (
      <AppPage width="standard">
        <PageError
          title="Could not load Play Next."
          description={error?.message || "Please try again."}
          onRetry={() => Promise.all([refresh(), loadQueue()]).catch(() => {})}
        />
      </AppPage>
    );
  }

  const focused = queueEntries;
  const later = [];
  const selectedGenre = selectedGenres[0] || "";
  const focusQuery = addSearch.trim().toLowerCase();
  const searchedFocusGroups = focusQuery
    ? focusSuggestionGroups({
        candidates: focusCandidates.filter(({ game }) =>
          titleOf(game).toLowerCase().includes(focusQuery),
        ),
        queueIds: candidateBanks[assigningRole] || [],
        includeUnrecommended: true,
      })
    : null;
  const visibleFocusSections = (() => {
    if (searchedFocusGroups) {
      const results = [
        ...searchedFocusGroups.active,
        ...searchedFocusGroups.shortlist,
        ...searchedFocusGroups.backlog,
      ];
      return results.length ? [{ title: "Search results", candidates: results }] : [];
    }
    if (showAllFocusCandidates) {
      return [
        { title: "Already playing", candidates: focusGroups.active },
        { title: `From your ${assigningRole} candidates`, candidates: focusGroups.shortlist },
        { title: "From your backlog", candidates: focusGroups.backlog },
      ].filter(({ candidates }) => candidates.length);
    }
    const recommendedBySource = [
      {
        title: "Already playing",
        candidates: focusGroups.active.slice(0, 2),
      },
      {
        title: `From your ${assigningRole} candidates`,
        candidates: focusGroups.recommended.filter(
          ({ source }) => source === "shortlist",
        ),
      },
      {
        title: "From your backlog",
        candidates: focusGroups.recommended.filter(
          ({ source }) => source === "backlog",
        ),
      },
    ];
    return recommendedBySource.filter(({ candidates }) => candidates.length);
  })();
  const visibleFocusCount = visibleFocusSections.reduce(
    (count, section) => count + section.candidates.length,
    0,
  );
  const recommendedFocusCount =
    focusGroups.active.length +
    focusGroups.shortlist.length +
    focusGroups.backlog.length;
  const randomMoodGame = byId.get(String(randomPickId)) || null;
  const defaultMoodPick = picks.find((pick) => pick.lane === "priority") || null;
  const moodPick = randomMoodGame
    ? {
        lane: "priority",
        title: "Picked for you",
        game: randomMoodGame,
        reason: selectedGenre
          ? `A random match for your ${selectedGenre} vibe.`
          : "A random pick from your eligible backlog.",
      }
    : defaultMoodPick;
  const suggestionActive = selectedGenres.length > 0 || !!randomMoodGame;

  return (
    <AppPage width="wide" className="overflow-x-clip">
      <div className="space-y-9">
        <PageHeader
          title="Play Next"
          description="Keep two games in focus, then make starting the easy part."
          meta={`${[mainGame, sideGame].filter(Boolean).length}/2 focus slots filled`}
          actions={
            <div className="flex flex-wrap gap-2">
              {["main", "side"].map((role) => (
                <Button
                  key={role}
                  type="button"
                  variant={role === "main" ? "primary" : "secondary"}
                  onClick={() => {
                    setAddingRole(role);
                    setAssigningRole("");
                    setShowAllFocusCandidates(false);
                    setAddOpen(true);
                  }}
                >
                  <ListPlus className="h-4 w-4" aria-hidden="true" />
                  Add {role} candidate
                </Button>
              ))}
            </div>
          }
        />

        <section aria-label="Focus games">
          <div className="mb-4 flex items-end justify-between gap-3">
            <SectionHeader title="What are you playing?" className="mb-0" />
            {!mainGame && !sideGame && activeGames.length ? (
              <span className="text-sm text-content-muted">
                Choose from your {activeGames.length} active{" "}
                {activeGames.length === 1 ? "game" : "games"}.
              </span>
            ) : null}
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <FocusSlotCard
              role="main"
              game={mainGame}
              busy={busy}
              onChoose={() => openFocusPicker("main")}
              onPlay={playGame}
              onNote={openNote}
              onOpen={setSelectedGame}
              onClear={clearFocus}
            />
            <FocusSlotCard
              role="side"
              game={sideGame}
              busy={busy}
              onChoose={() => openFocusPicker("side")}
              onPlay={playGame}
              onNote={openNote}
              onOpen={setSelectedGame}
              onClear={clearFocus}
            />
          </div>
        </section>

        <section aria-labelledby="mood-pick-title">
          <Panel bodyClassName="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <h3
                  id="mood-pick-title"
                  className="font-semibold text-content-primary"
                >
                  Want something different tonight?
                </h3>
                <p className="mt-1 text-sm text-content-muted">
                  Choose a personal genre without replacing Main or Side.
                </p>
              </div>
              {genreOptions.length ? (
                <SelectMenu
                  value={selectedGenre}
                  onChange={chooseGenre}
                  aria-label="Choose a mood genre"
                  className="w-full sm:w-64"
                  options={[
                    { value: "", label: "Choose by vibe" },
                    ...genreOptions.map((genre) => ({
                      value: genre,
                      label: genre,
                    })),
                  ]}
                />
              ) : null}
              <Button type="button" variant="secondary" onClick={surprise}>
                <Shuffle className="h-4 w-4" aria-hidden="true" />
                Pick for me
              </Button>
            </div>
            {suggestionActive ? (
              moodPick ? (
                <div className="mt-4">
                  <RecommendationCard
                    pick={moodPick}
                    returning={false}
                    continuing={false}
                    onStart={playGame}
                    onContinue={openNote}
                    onDismiss={() =>
                      randomMoodGame ? surprise() : showAnotherMoodPick(moodPick)
                    }
                  />
                </div>
              ) : (
                <p className="mt-4 text-sm text-content-muted">
                  No candidate matches this personal genre. Your focus games
                  have not changed.
                </p>
              )
            ) : null}
          </Panel>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader
              title={`Candidate banks (${queueGames.length})`}
              className="mb-0"
            />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCandidatesOpen((current) => !current)}
                aria-expanded={candidatesOpen}
              >
                {candidatesOpen ? (
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                )}
                {candidatesOpen ? "Hide candidates" : "Show candidates"}
              </Button>
            </div>
          </div>

          {candidatesOpen ? (
            queueEntries.length ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={({ active, over }) => {
                  if (!over || String(active.id) === String(over.id)) return;
                  const activeEntry = queueEntries.find(
                    ({ game }) => String(game.id) === String(active.id),
                  );
                  const overEntry = queueEntries.find(
                    ({ game }) => String(game.id) === String(over.id),
                  );
                  if (!activeEntry || activeEntry.role !== overEntry?.role) return;
                  const role = activeEntry.role;
                  const roleIds = candidateBanks[role] || [];
                  const from = roleIds.findIndex(
                    (id) => String(id) === String(active.id),
                  );
                  const to = roleIds.findIndex(
                    (id) => String(id) === String(over.id),
                  );
                  if (from < 0 || to < 0) return;
                  const previous = [...roleIds];
                  void saveOrder(
                    moveQueueItem(previous, active.id, to),
                    previous,
                    role,
                  );
                }}
              >
                <SortableContext
                  items={(laterOpen ? queueEntries : focused).map(({ game }) =>
                    String(game.id),
                  )}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {["main", "side"].map((role) => {
                      const entries = focused.filter((entry) => entry.role === role);
                      return (
                        <div key={role} className="space-y-3">
                          <div className="flex items-center justify-between px-1 pt-2">
                            <h3 className="font-semibold capitalize text-content-primary">
                              {role} candidates
                            </h3>
                            <span className="text-sm text-content-muted">{entries.length}</span>
                          </div>
                          {entries.length ? entries.map(({ game, index }) => (
                            <QueueRow
                              key={game.id}
                              game={game}
                              index={index}
                              count={entries.length}
                              saving={busy}
                              reorderDisabled={false}
                              returning={playNextStatusGroup(game.status, statusGroupOf) === "returning"}
                              candidateRole={role}
                              onStart={startGame}
                              onMove={(gameId, destination) => moveGame(gameId, destination, role)}
                              onChangeRole={addGame}
                              onRemove={removeGame}
                              onOpen={setSelectedGame}
                            />
                          )) : (
                            <p className="rounded-xl border border-dashed border-surface-border p-4 text-sm text-content-muted">
                              No {role} candidates saved yet.
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {later.length ? (
                      <div className="rounded-2xl border border-surface-border bg-surface-card/65">
                        <button
                          type="button"
                          onClick={() => setLaterOpen((current) => !current)}
                          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-content-primary"
                          aria-expanded={laterOpen}
                        >
                          <span>Later in queue ({later.length})</span>
                          {laterOpen ? (
                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                        {laterOpen ? (
                          <div className="space-y-3 border-t border-surface-border p-3">
                            {later.map(({ game, index, role }) => (
                              <QueueRow
                                key={game.id}
                                game={game}
                                index={index}
                                count={queueGames.length}
                                saving={busy}
                                reorderDisabled={false}
                                returning={
                                  playNextStatusGroup(
                                    game.status,
                                    statusGroupOf,
                                  ) === "returning"
                                }
                                candidateRole={role}
                                onStart={startGame}
                                onMove={(gameId, destination) => moveGame(gameId, destination, role)}
                                onChangeRole={addGame}
                                onRemove={removeGame}
                                onOpen={setSelectedGame}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <EmptyState
                icon={LibraryBig}
                title={
                  activeGames.length
                    ? "Build small candidate banks."
                    : "Choose your next game."
                }
                description={
                  activeGames.length
                    ? "Continue the active game suggested above, or add a few backlog games you want to play soon."
                    : "Add a few backlog or Come back games you genuinely want to play soon."
                }
                action={
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setAddOpen(true)}
                  >
                    <ListPlus className="h-4 w-4" aria-hidden="true" />
                    Add candidates
                  </Button>
                }
              />
            )
          ) : (
            <button
              type="button"
              onClick={() => setCandidatesOpen(true)}
              className="flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border border-surface-border bg-surface-card/65 px-4 py-3 text-left text-sm text-content-muted hover:border-primary/35 hover:text-content-secondary"
            >
              <span>
                {queueGames.length
                  ? "Your Main and Side candidates are saved until a focus slot opens."
                  : "Save a few Main and Side candidates for later."}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          )}
        </section>

        {otherActiveGames.length ? (
          <section>
            <div className="rounded-2xl border border-surface-border bg-surface-card/65">
              <button
                type="button"
                onClick={() => setActiveOpen((current) => !current)}
                className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70 sm:px-5"
                aria-expanded={activeOpen}
              >
                <span>
                  <span className="block font-semibold text-content-primary">
                    Other active games ({otherActiveGames.length})
                  </span>
                  <span className="mt-0.5 block text-sm text-content-muted">
                    Available without competing with Main and Side.
                  </span>
                </span>
                {activeOpen ? (
                  <ChevronUp className="h-5 w-5 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown
                    className="h-5 w-5 shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
              {activeOpen ? (
                <div className="space-y-3 border-t border-surface-border p-3 sm:p-4">
                  {otherActiveGames.map((game) => (
                    <OtherActiveRow
                      key={game.id}
                      game={game}
                      busy={busy}
                      occasional={occasionalIds.has(String(game.id))}
                      onPlay={playGame}
                      onAssign={assignFocus}
                      onClear={clearFocus}
                      onNote={openNote}
                      onOpen={setSelectedGame}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {returningGames.length ? (
          <section>
            <div className="rounded-2xl border border-surface-border bg-surface-card/65">
              <button
                type="button"
                onClick={() => setReturningOpen((current) => !current)}
                className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70 sm:px-5"
                aria-expanded={returningOpen}
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-content-primary">
                    Come back ({returningGames.length})
                  </span>
                </span>
                {returningOpen ? (
                  <ChevronUp className="h-5 w-5 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown
                    className="h-5 w-5 shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
              {returningOpen ? (
                <div className="space-y-3 border-t border-surface-border p-3 sm:p-4">
                  {returningGames.map((game) => (
                    <ReturningRow
                      key={game.id}
                      game={game}
                      busy={busy}
                      onAdd={(game) => addGame(game, "main")}
                      onNote={openNote}
                      onOpen={setSelectedGame}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <Modal
        open={addOpen}
        title={
          assigningRole
            ? `Choose your ${assigningRole} game`
            : `Add ${addingRole} candidates`
        }
        description={
          assigningRole
            ? `Compare what you are already playing, your ${assigningRole} bank, and a strict backlog recommendation.`
            : `Save games you want considered for your next ${addingRole} slot.`
        }
        size="sm"
        className="max-h-[min(80dvh,44rem)]"
        onClose={() => {
          setAddOpen(false);
          setAddSearch("");
          setAssigningRole("");
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
          <TextInput
            value={addSearch}
            onChange={(event) => setAddSearch(event.target.value)}
            placeholder="Search all games to override suggestions"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="mt-4 space-y-4">
          {assigningRole
            ? visibleFocusSections.map((section) => (
                <section key={section.title} aria-label={section.title}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-content-muted">
                    {section.title}
                  </h3>
                  <div className="space-y-2">
                    {section.candidates.map((candidate) => (
                      <FocusPickerRow
                        key={candidate.game.id}
                        candidate={candidate}
                        busy={busy}
                        onChoose={(game) => assignFocus(game, assigningRole)}
                      />
                    ))}
                  </div>
                </section>
              ))
            : addCandidates.map((game) => (
                <div
                  key={game.id}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-surface-border bg-surface-bg/40 p-2"
                >
                  <GameCover
                    src={game.cover}
                    name={titleOf(game)}
                    className="h-16 w-11 shrink-0 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-content-primary">
                      {titleOf(game)}
                    </div>
                    <div className="mt-1 text-xs text-content-muted">
                      {String(game.status).toLowerCase() === "plan to play soon"
                        ? "Planned soon"
                        : knownHours(game) != null
                          ? `Short option: about ${knownHours(game)}h`
                          : statusDisplayLabel(game.status)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => addGame(game)}
                    disabled={busy}
                  >
                    Add
                  </Button>
                </div>
              ))}
          {(assigningRole ? !visibleFocusCount : !addCandidates.length) ? (
            <p className="rounded-xl border border-surface-border bg-surface-bg/40 p-4 text-sm text-content-muted">
              {addSearch.trim()
                ? "No eligible games match this search."
                : assigningRole
                  ? "No eligible games are available for this slot."
                  : "Every eligible game is already saved as a candidate, or your remaining games are Playing or Done."}
            </p>
          ) : null}
          {assigningRole &&
          !showAllFocusCandidates &&
          !addSearch.trim() &&
          recommendedFocusCount > visibleFocusCount ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setShowAllFocusCandidates(true)}
            >
              Show all {recommendedFocusCount} recommended games
            </Button>
          ) : null}
        </div>
      </Modal>

      <Sheet
        open={!!noteGame}
        title={`Next time - ${noteGame ? titleOf(noteGame) : ""}`}
        description="Where were you, and what do you want to do next? This note is private."
        onClose={() => setNoteGame(null)}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-content-muted">
              {noteDraft.length}/1000
            </span>
            <div className="flex gap-2">
              {noteDraft ? (
                <Button
                  type="button"
                  variant="dangerGhost"
                  onClick={() => setNoteDraft("")}
                  disabled={busy}
                >
                  Clear note
                </Button>
              ) : null}
              <Button
                type="button"
                variant="primary"
                onClick={saveNote}
                disabled={busy || noteDraft.length > 1000}
              >
                Save
              </Button>
            </div>
          </div>
        }
      >
        <Textarea
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          maxLength={1000}
          rows={8}
          autoFocus
          placeholder="Example: Return to the village, upgrade the bow, then continue the northern quest."
          className="min-h-48 whitespace-pre-wrap"
        />
      </Sheet>

      {selectedGame ? (
        <GameModal
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
          onSubmitEdit={editFromModal}
          onGameUpdated={setSelectedGame}
          statuses={statuses}
          onAddToNextUp={() => addGame(selectedGame)}
          onDelete={deleteSelectedGame}
        />
      ) : null}
    </AppPage>
  );
}
