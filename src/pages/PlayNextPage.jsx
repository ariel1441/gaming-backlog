import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
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
import { Link } from "react-router-dom";
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
  getNextUp,
  removeFromNextUp,
  reorderNextUp,
  startPlaying,
} from "../services/nextUpService";
import {
  matchesMyGenres,
  moveQueueItem,
  playNextStatusGroup,
  recommendationCandidates,
  surprisePool,
} from "../utils/playNext";
import { splitCsv } from "../utils/gameList";
import {
  apiErrorMessage,
  buildEditGamePayload,
} from "./Backlog/backlogForm";

const FOCUSED_QUEUE_LIMIT = 10;

function titleOf(game) {
  return game?.displayName || game?.name || "Untitled game";
}

function knownHours(game) {
  const hours = Number(game?.how_long_to_beat);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
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
    <Panel className="min-w-0" bodyClassName="flex h-full flex-col p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-light">
        {pick.title}
      </div>
      <div className="mt-3 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <h3
          className="line-clamp-2 min-w-0 text-lg font-semibold text-content-primary"
          title={titleOf(pick.game)}
        >
          {titleOf(pick.game)}
        </h3>
        <p className="min-w-0 text-sm leading-5 text-content-muted sm:max-w-[48%] sm:text-right">
          {pick.reason}
        </p>
      </div>
      <GameCover
        src={pick.game.cover}
        name={titleOf(pick.game)}
        className="mt-4 aspect-video w-full rounded-xl border border-media-border/10 shadow-lg"
        showFallbackLabel
      />
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
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
          Not today
        </Button>
      </div>
    </Panel>
  );
}

function AlsoPlayingCard({ game, onNote, onOpen }) {
  const note = String(game.resume_note || "").trim();
  return (
    <article className="relative min-w-0 overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-sm">
      <GameRowBackdrop game={game} />
      <div className="relative flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => onOpen(game)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70"
        >
          <GameCover
            src={game.cover}
            name={titleOf(game)}
            className="h-20 w-32 shrink-0 rounded-lg border border-media-border/10 shadow-md"
          />
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-semibold text-content-primary">
              {titleOf(game)}
            </h3>
            <div className="mt-1.5">
              <StatusBadge status={game.status} />
            </div>
            <p className="mt-2 line-clamp-2 whitespace-pre-line break-words text-sm text-content-muted">
              {note || "No Next time note yet."}
            </p>
          </div>
        </button>
        <Button
          type="button"
          variant={note ? "secondary" : "primary"}
          size="sm"
          onClick={() => onNote(game)}
          className="w-full shrink-0 sm:w-auto"
        >
          <StickyNote className="h-4 w-4" aria-hidden="true" />
          {note ? "Edit note" : "Add note"}
        </Button>
      </div>
    </article>
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
  const genres = splitCsv(game.my_genre);
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
  onStart,
  onMove,
  onRemove,
  onOpen,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: String(game.id), disabled: saving || reorderDisabled });
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
                <span className="font-semibold text-content-primary">Next time: </span>
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
            Add to Next Up
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
  const [queueIds, setQueueIds] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [noteGame, setNoteGame] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const [returningOpen, setReturningOpen] = useState(true);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [dismissed, setDismissed] = useState({
    priority: new Set(),
    quick: new Set(),
    continue: new Set(),
  });

  const loadQueue = useCallback(async () => {
    if (!isAuthenticated) {
      setQueueIds([]);
      setQueueLoading(false);
      setQueueError(null);
      return;
    }
    setQueueLoading(true);
    setQueueError(null);
    try {
      const payload = await getNextUp();
      setQueueIds(Array.isArray(payload?.gameIds) ? payload.gameIds : []);
    } catch (error) {
      setQueueError(error);
    } finally {
      setQueueLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const byId = useMemo(
    () => new Map(games.map((game) => [String(game.id), game])),
    [games],
  );
  const queueGames = useMemo(
    () => queueIds.map((id) => byId.get(String(id))).filter(Boolean),
    [byId, queueIds],
  );
  const activeGames = useMemo(
    () =>
      games.filter(
        (game) =>
          playNextStatusGroup(game.status, statusGroupOf) === "playing",
      ),
    [games, statusGroupOf],
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
  const genreOptions = useMemo(() => {
    const labels = new Map();
    games.forEach((game) => {
      splitCsv(game.my_genre).forEach((genre) => {
        const key = genre.toLowerCase();
        if (!labels.has(key)) labels.set(key, genre);
      });
    });
    return [...labels.values()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [games]);
  const queueEntries = useMemo(
    () =>
      queueGames
        .map((game, index) => ({ game, index }))
        .filter(({ game }) => matchesMyGenres(game, selectedGenres)),
    [queueGames, selectedGenres],
  );
  const returningGames = useMemo(
    () =>
      games
        .filter(
          (game) =>
            playNextStatusGroup(game.status, statusGroupOf) === "returning" &&
            !queueSet.has(String(game.id)),
        )
        .filter((game) => matchesMyGenres(game, selectedGenres))
        .sort((a, b) => Number(a.id) - Number(b.id)),
    [games, queueSet, selectedGenres, statusGroupOf],
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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const saveOrder = async (nextIds, previousIds) => {
    if (nextIds.every((id, index) => String(id) === String(previousIds[index])))
      return;
    setQueueIds(nextIds);
    setBusy(true);
    try {
      const payload = await reorderNextUp(nextIds);
      setQueueIds(payload?.gameIds || nextIds);
    } catch (error) {
      setQueueIds(previousIds);
      toast.error(error.message || "Could not save the queue order.");
      await loadQueue();
    } finally {
      setBusy(false);
    }
  };

  const moveGame = (gameId, destination) => {
    const previous = [...queueIds];
    void saveOrder(moveQueueItem(previous, gameId, destination), previous);
  };

  const addGame = async (game) => {
    setBusy(true);
    try {
      const payload = await addToNextUp(game.id);
      setQueueIds(payload.gameIds || [...queueIds, game.id]);
      toast.success(`${titleOf(game)} added at position ${payload.position + 1}.`);
    } catch (error) {
      toast.error(error.message || "Could not add this game to Next Up.");
    } finally {
      setBusy(false);
    }
  };

  const removeGame = async (gameId) => {
    const previous = [...queueIds];
    setQueueIds((current) =>
      current.filter((id) => String(id) !== String(gameId)),
    );
    setBusy(true);
    try {
      const payload = await removeFromNextUp(gameId);
      setQueueIds(payload.gameIds || []);
      toast.success("Removed from Next Up.");
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
        ? `Status will change to Playing. Your existing start date (${String(game.started_at).slice(0, 10)}) will be kept, and the game will leave Next Up.`
        : "Status will change to Playing, today's date will be recorded as the start date, and the game will leave Next Up.",
      confirmLabel: returning ? "Resume playing" : "Start playing",
      tone: "primary",
    });
    if (!approved) return;
    setBusy(true);
    try {
      if (!queueSet.has(String(game.id))) {
        await addToNextUp(game.id);
      }
      const payload = await startPlaying(game.id);
      setQueueIds(payload.gameIds || []);
      if (payload.game) {
        upsertGame(payload.game);
        setSelectedGame((current) =>
          current?.id === payload.game.id ? payload.game : current,
        );
      }
      toast.success(`${titleOf(game)} is now in Playing now.`);
    } catch (error) {
      toast.error(error.message || "Could not start this game.");
      await loadQueue();
    } finally {
      setBusy(false);
    }
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
      const next = updated || { ...noteGame, resume_note: noteDraft.trim() || null };
      setNoteGame(null);
      setSelectedGame((current) =>
        current?.id === next.id ? { ...current, ...next } : current,
      );
      toast.success(noteDraft.trim() ? "Next time note saved." : "Next time note cleared.");
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
      toast.success("Game updated.");
      return { ok: true, game: updated };
    } catch (error) {
      toast.error(error.message || "Could not update this game.");
      return { ok: false };
    }
  };

  const surprise = () => {
    const pool = surprisePool({
      pool: "next-up",
      games,
      queueIds,
      statusGroupOf,
      selectedGenres,
    });
    if (!pool.length) {
      if (!queueGames.length) setAddOpen(true);
      toast.info(
        selectedGenres.length
          ? "No games in Next Up match your current mood."
          : "Next Up is empty. Add games before asking for a random pick.",
      );
      return;
    }
    setSelectedGame(pool[Math.floor(Math.random() * pool.length)]);
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
          description="Your Next Up queue and Next time notes are private to your account. You can also try the writable demo from the Backlog page."
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
          onRetry={() =>
            Promise.all([refresh(), loadQueue()]).catch(() => {})
          }
        />
      </AppPage>
    );
  }

  const focused = queueEntries.filter(
    ({ index }) => index < FOCUSED_QUEUE_LIMIT,
  );
  const later = queueEntries.filter(
    ({ index }) => index >= FOCUSED_QUEUE_LIMIT,
  );
  const moodActive = selectedGenres.length > 0;
  const selectedGenre = selectedGenres[0] || "";

  return (
    <AppPage width="wide" className="overflow-x-clip">
      <div className="space-y-9">
        <PageHeader
          title="Play Next"
          description="Choose what to play and remember where you left off."
          meta={`${queueGames.length} in queue`}
          actions={
            <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>
              <ListPlus className="h-4 w-4" aria-hidden="true" />
              Add games
            </Button>
          }
        />

        <section aria-labelledby="pick-game-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3
              id="pick-game-title"
              className="text-sm font-semibold uppercase tracking-[0.16em] text-content-secondary"
            >
              Pick a game
            </h3>
            {genreOptions.length ? (
              <SelectMenu
                value={selectedGenre}
                onChange={(value) => setSelectedGenres(value ? [value] : [])}
                aria-label="Choose a mood genre"
                className="ml-auto w-44 sm:w-64"
                options={[
                  { value: "", label: "Anything" },
                  ...genreOptions.map((genre) => ({
                    value: genre,
                    label: genre,
                  })),
                ]}
              />
            ) : null}
          </div>
          {picks.length ? (
            <div className="grid min-w-0 gap-4 lg:grid-cols-3">
              {picks.map((pick) => (
                <RecommendationCard
                  key={pick.lane}
                  pick={pick}
                  returning={
                    playNextStatusGroup(pick.game.status, statusGroupOf) ===
                    "returning"
                  }
                  continuing={pick.lane === "continue"}
                  onStart={startGame}
                  onContinue={openNote}
                  onDismiss={() =>
                    setDismissed((current) => ({
                      ...current,
                      [pick.lane]: new Set(current[pick.lane]).add(pick.game.id),
                    }))
                  }
                />
              ))}
            </div>
          ) : (
            <Panel bodyClassName="p-5">
              <p className="text-sm text-content-muted">
                {moodActive
                  ? "No recommendation can be supported by games matching this mood. Try another genre or clear the mood."
                  : "Add games to Next Up to get a priority pick. Duration and return suggestions appear only when your library has supporting data."}
              </p>
            </Panel>
          )}
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader
              title="Next Up"
              className="mb-0"
            />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={surprise}>
                <Shuffle className="h-4 w-4" aria-hidden="true" />
                Surprise me
              </Button>
            </div>
          </div>

          {queueEntries.length ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={({ active, over }) => {
                if (moodActive) return;
                if (!over || String(active.id) === String(over.id)) return;
                const from = queueIds.findIndex(
                  (id) => String(id) === String(active.id),
                );
                const to = queueIds.findIndex(
                  (id) => String(id) === String(over.id),
                );
                if (from < 0 || to < 0) return;
                const previous = [...queueIds];
                void saveOrder(
                  moveQueueItem(previous, active.id, to),
                  previous,
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
                  {moodActive ? (
                    <p className="rounded-xl border border-state-info/30 bg-state-info/10 px-4 py-3 text-sm text-content-secondary">
                      Queue order is preserved while a mood is selected. Clear the
                      mood to drag or move games.
                    </p>
                  ) : null}
                  {focused.map(({ game, index }) => (
                    <QueueRow
                      key={game.id}
                      game={game}
                      index={index}
                      count={queueGames.length}
                      saving={busy}
                      reorderDisabled={moodActive}
                      returning={
                        playNextStatusGroup(game.status, statusGroupOf) ===
                        "returning"
                      }
                      onStart={startGame}
                      onMove={moveGame}
                      onRemove={removeGame}
                      onOpen={setSelectedGame}
                    />
                  ))}
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
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                      {laterOpen ? (
                        <div className="space-y-3 border-t border-surface-border p-3">
                          {later.map(({ game, index }) => (
                            <QueueRow
                              key={game.id}
                              game={game}
                              index={index}
                              count={queueGames.length}
                              saving={busy}
                              reorderDisabled={moodActive}
                              returning={
                                playNextStatusGroup(
                                  game.status,
                                  statusGroupOf,
                                ) === "returning"
                              }
                              onStart={startGame}
                              onMove={moveGame}
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
          ) : moodActive && queueGames.length ? (
            <EmptyState
              icon={LibraryBig}
              title="Nothing in Next Up matches this mood."
              description="Your saved queue has not changed. Clear the mood or choose another personal genre."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedGenres([])}
                >
                  Clear mood
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={LibraryBig}
              title={
                activeGames.length
                  ? "Build a small shortlist."
                  : "Choose your next game."
              }
              description={
                activeGames.length
                  ? "Continue the active game suggested above, or add a few backlog games you want to play soon."
                  : "Add a few backlog or Come back games you genuinely want to play soon."
              }
              action={
                <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>
                  <ListPlus className="h-4 w-4" aria-hidden="true" />
                  Add games
                </Button>
              }
            />
          )}
        </section>

        {activeGames.length ? (
          <section>
            <SectionHeader
              title={`Continue playing (${activeGames.length})`}
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {activeGames.map((game) => (
                <AlsoPlayingCard
                  key={game.id}
                  game={game}
                  onNote={openNote}
                  onOpen={setSelectedGame}
                />
              ))}
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
                  <ChevronDown className="h-5 w-5 shrink-0" aria-hidden="true" />
                )}
              </button>
              {returningOpen ? (
                <div className="space-y-3 border-t border-surface-border p-3 sm:p-4">
                  {returningGames.map((game) => (
                    <ReturningRow
                      key={game.id}
                      game={game}
                      busy={busy}
                      onAdd={addGame}
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
        title="Add games to Next Up"
        description="Choose owner games outside Playing and Done. Games are appended in order."
        size="sm"
        className="max-h-[min(80dvh,44rem)]"
        onClose={() => {
          setAddOpen(false);
          setAddSearch("");
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
          <TextInput
            value={addSearch}
            onChange={(event) => setAddSearch(event.target.value)}
            placeholder="Search eligible games"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="mt-4 space-y-2">
          {addCandidates.map((game) => (
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
                      : game.status}
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
          {!addCandidates.length ? (
            <p className="rounded-xl border border-surface-border bg-surface-bg/40 p-4 text-sm text-content-muted">
              {addSearch.trim()
                ? "No eligible games match this search."
                : "Every eligible game is already queued, or your remaining games are Playing or Done."}
            </p>
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
