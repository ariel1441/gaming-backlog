import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpAZ,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Search,
  SearchX,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import GameModal from "../components/GameModal";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  SelectMenu,
  StatusBadge,
  Textarea,
  TextInput,
  useToast,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useStatusGroups } from "../contexts/StatusGroupsContext";
import { useGames } from "../hooks/useGames";
import {
  apiErrorMessage,
  buildEditGamePayload,
} from "./Backlog/backlogForm";
import { resolveGameHours } from "../utils/hours";
import {
  filterReviewGames,
  formatReviewDate,
  formatReviewScore,
  hasRealScore,
  hasReview,
  reviewGenres,
  reviewText,
} from "../utils/reviews";

const reviewFilterOptions = [
  { value: "all", label: "All reviews" },
  { value: "completed", label: "Completed" },
  { value: "notCompleted", label: "Not completed" },
];

const sortOptions = [
  { value: "", label: "Default backlog order" },
  { value: "finishedDate", label: "Finished date" },
  { value: "startedDate", label: "Started date" },
  { value: "releaseDate", label: "Release date" },
  { value: "hoursPlayed", label: "Hours" },
  { value: "myScore", label: "My score" },
  { value: "name", label: "Name" },
];

function StatPill({ icon: Icon, label, value }) {
  return (
    <div className="inline-flex min-h-11 items-center gap-3 rounded-2xl border border-surface-border bg-surface-card/80 px-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-border bg-surface-elevated/70 text-content-secondary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-base font-semibold text-content-primary">{value}</span>
      <span className="text-xs uppercase tracking-[0.18em] text-content-secondary">
        {label}
      </span>
    </div>
  );
}

function ReviewsSkeleton() {
  return (
    <main className="min-h-screen bg-surface-bg px-4 py-6 text-content-primary sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="h-28 animate-pulse rounded-2xl border border-surface-border bg-surface-card" />
        <div className="h-20 animate-pulse rounded-2xl border border-surface-border bg-surface-card" />
        <div className="grid gap-5 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-72 animate-pulse rounded-2xl border border-surface-border bg-surface-card"
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function ReviewsHeader({ summary }) {
  const navigate = useNavigate();

  return (
    <header className="border-b border-surface-border pb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Backlog
          </Button>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-surface-border bg-surface-elevated/70 text-content-secondary">
            <MessageSquareText className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-content-primary">Reviews</h1>
            <p className="text-sm text-content-secondary">
              Games where you wrote thoughts, notes, or a personal review.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <StatPill icon={MessageSquareText} label="Reviews" value={summary.total} />
        <StatPill icon={CheckCircle2} label="Completed" value={summary.completed} />
        <StatPill icon={Clock3} label="Not completed" value={summary.notCompleted} />
        <StatPill icon={Star} label="Avg score" value={summary.averageScore} />
      </div>
    </header>
  );
}

function ReviewsControls({
  search,
  setSearch,
  reviewFilter,
  setReviewFilter,
  sortKey,
  setSortKey,
  isReversed,
  setIsReversed,
  hasActiveFilters,
  onClear,
  visibleCount,
  totalCount,
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card/75 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-center">
        <label className="relative block min-w-0">
          <span className="sr-only">Search reviews</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
            aria-hidden="true"
          />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reviews"
            className="pl-9 pr-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary"
              aria-label="Clear review search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex flex-wrap gap-2">
            {reviewFilterOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={reviewFilter === option.value ? "primary" : "secondary"}
                onClick={() => setReviewFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <SelectMenu
            value={sortKey}
            onChange={setSortKey}
            options={sortOptions}
            className="w-full min-w-44 sm:w-56"
          />
          <IconButton
            icon={isReversed ? ArrowUpAZ : ArrowDownAZ}
            onClick={() => setIsReversed(!isReversed)}
            label={isReversed ? "Ascending order" : "Descending order"}
            title={isReversed ? "Ascending order" : "Descending order"}
            className="h-10 w-10"
          />

          {hasActiveFilters ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClear}>
              <X className="h-4 w-4" aria-hidden="true" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-xs text-content-secondary">
        Showing {visibleCount} of {totalCount} reviews.
      </p>
    </section>
  );
}

function coverUrl(game) {
  return typeof game?.cover === "string" && game.cover.trim() ? game.cover : null;
}

function gameInitials(title = "") {
  const words = String(title || "Game")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function ReviewMedia({ game }) {
  const src = coverUrl(game);

  return (
    <div className="relative h-56 w-full shrink-0 overflow-hidden rounded-2xl border border-surface-border bg-surface-elevated shadow-xl shadow-black/25 sm:h-auto sm:min-h-72 sm:w-48 sm:self-stretch lg:w-52">
      {src ? (
        <>
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-md"
            loading="lazy"
          />
          <img
            src={src}
            alt=""
            className="relative h-full w-full object-cover object-center transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-card text-5xl font-semibold text-content-muted/35">
          {gameInitials(game?.name)}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ game, onOpen, onEdit }) {
  const hours = resolveGameHours(game);
  const finished = formatReviewDate(game.finished_at);
  const started = formatReviewDate(game.started_at);
  const score = formatReviewScore(game.my_score);
  const { myGenres } = reviewGenres(game);

  return (
    <article
      className={[
        "group relative min-w-0 rounded-2xl border border-surface-border bg-surface-card/80 p-3 shadow-sm transition",
        "hover:border-primary/45 hover:bg-surface-card hover:shadow-glow-primary",
      ].join(" ")}
    >
      <div className="absolute right-4 top-4 z-20 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
        <IconButton
          icon={Pencil}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(game);
          }}
          className="action-button h-9 w-9 shadow-md hover:border-secondary hover:bg-secondary hover:text-white"
          label="Edit thoughts"
          title="Edit thoughts"
        />
      </div>
      <button
        type="button"
        onClick={() => onOpen(game)}
        className="block h-full w-full min-w-0 text-left"
      >
        <div className="flex h-full flex-col gap-4 sm:flex-row sm:gap-5">
          <ReviewMedia game={game} />

          <div className="flex min-w-0 flex-1 flex-col py-1 pr-11 sm:min-h-72">
            <div className="min-w-0">
              <h2 className="line-clamp-2 text-2xl font-semibold leading-snug text-content-primary">
                {game.name}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={game.status || "Unknown"} />
                {score ? <Badge variant="warning">{score}/10</Badge> : null}
              </div>
            </div>

            <p className="mt-5 whitespace-pre-line text-sm leading-6 text-content-secondary sm:text-[0.95rem]">
              {reviewText(game)}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {finished ? <Badge variant="success">Finished {finished}</Badge> : null}
              {!finished && started ? <Badge variant="warning">Started {started}</Badge> : null}
              {hours.hours ? (
                <Badge variant={hours.isActual ? "primary" : "success"}>
                  {hours.label}
                </Badge>
              ) : null}
              {myGenres.map((genre) => (
                <Badge key={`my-${genre}`} variant="primary">
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}

function ThoughtsEditModal({
  game,
  value,
  onChange,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}) {
  if (!game) return null;

  return (
    <Modal
      title="Edit thoughts"
      description={game.name}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="max-w-4xl"
      bodyClassName="p-5 sm:p-6"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="review-thoughts-form" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >
      <form id="review-thoughts-form" onSubmit={onSubmit} className="space-y-4">
        {error?.message ? (
          <div
            className="rounded-xl border border-state-error/35 bg-state-error/10 px-4 py-3 text-sm text-state-error"
            role="alert"
          >
            {error.message}
          </div>
        ) : null}
        <Field id="review-thoughts" label="Thoughts">
          <Textarea
            id="review-thoughts"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={18}
            disabled={isSubmitting}
            autoFocus
            className="min-h-[52vh] max-h-[65vh] text-base leading-7"
          />
        </Field>
      </form>
    </Modal>
  );
}

export default function ReviewsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { games, loading, error, refresh, editGame } = useGames();
  const { statusGroupOf } = useStatusGroups();
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedGame, setSelectedGame] = useState(null);
  const [editingGame, setEditingGame] = useState(null);
  const [thoughtsDraft, setThoughtsDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editFormError, setEditFormError] = useState(null);
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [sortKey, setSortKey] = useState("");
  const [isReversed, setIsReversed] = useState(false);

  const isCompleted = React.useCallback(
    (game) => statusGroupOf(game?.status) === "done",
    [statusGroupOf]
  );

  const reviewedGames = useMemo(() => games.filter(hasReview), [games]);

  const visibleReviews = useMemo(
    () =>
      filterReviewGames({
        games,
        search,
        reviewFilter,
        sortKey,
        isReversed,
        isDone: isCompleted,
      }),
    [games, search, reviewFilter, sortKey, isReversed, isCompleted]
  );

  const summary = useMemo(() => {
    const total = reviewedGames.length;
    const completed = reviewedGames.filter(isCompleted).length;
    const scores = reviewedGames
      .map((game) => game.my_score)
      .filter(hasRealScore)
      .map(Number);
    const averageScore = scores.length
      ? (scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1)
      : "--";
    return {
      total,
      completed,
      notCompleted: total - completed,
      averageScore,
    };
  }, [isCompleted, reviewedGames]);

  const hasActiveFilters = Boolean(
    search.trim() || reviewFilter !== "all" || sortKey || isReversed
  );

  const clearFilters = () => {
    setSearch("");
    setReviewFilter("all");
    setSortKey("");
    setIsReversed(false);
  };

  const startEditingReview = (game) => {
    setSelectedGame(null);
    setEditFormError(null);
    setEditingGame(game);
    setThoughtsDraft(reviewText(game));
  };

  const handleEditThoughts = async (event) => {
    event.preventDefault();
    if (isEditing) return;
    const original = editingGame || {};
    const result = buildEditGamePayload(
      { ...original, thoughts: thoughtsDraft },
      original
    );
    if (!result.ok) {
      setEditFormError({ message: result.message, fields: result.fields || {} });
      toast.warning(result.message);
      return;
    }

    try {
      setIsEditing(true);
      setEditFormError(null);
      await editGame(original.id, result.payload);
      setEditingGame(null);
      setThoughtsDraft("");
      toast.success("Review updated.");
    } catch (err) {
      const message = apiErrorMessage(
        err,
        "Failed to update review. Please check your inputs and try again."
      );
      setEditFormError({ message, fields: {} });
      toast.error(message);
    } finally {
      setIsEditing(false);
    }
  };

  const closeThoughtsEditor = () => {
    if (isEditing) return;
    setEditingGame(null);
    setThoughtsDraft("");
    setEditFormError(null);
  };

  if (authLoading || loading) return <ReviewsSkeleton />;

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-surface-bg px-4 py-6 text-content-primary sm:px-6">
        <EmptyState
          icon={MessageSquareText}
          title="Sign in to view your reviews."
          description="Reviews are built from the thoughts you saved on your backlog games."
          action={
            <Button type="button" variant="primary" onClick={() => navigate("/")}>
              Back to backlog
            </Button>
          }
        />
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-surface-bg px-4 py-6 text-content-primary sm:px-6">
        <EmptyState
          icon={MessageSquareText}
          title="Could not load your reviews."
          description={String(error?.message || error)}
          action={
            <Button type="button" variant="primary" onClick={() => refresh()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-bg px-4 py-6 text-content-primary sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <ReviewsHeader summary={summary} />

        <ReviewsControls
          search={search}
          setSearch={setSearch}
          reviewFilter={reviewFilter}
          setReviewFilter={setReviewFilter}
          sortKey={sortKey}
          setSortKey={setSortKey}
          isReversed={isReversed}
          setIsReversed={setIsReversed}
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          visibleCount={visibleReviews.length}
          totalCount={reviewedGames.length}
        />

        {visibleReviews.length ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {visibleReviews.map((game) => (
              <ReviewCard
                key={game.id || game.name}
                game={game}
                onOpen={setSelectedGame}
                onEdit={startEditingReview}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={reviewedGames.length ? SearchX : Sparkles}
            title={
              reviewedGames.length
                ? "No reviews match those filters."
                : "No reviews yet."
            }
            description={
              reviewedGames.length
                ? "Try clearing your search or completion filter."
                : "Write thoughts on a game and it will appear here as a review card."
            }
            action={
              reviewedGames.length ? (
                <Button type="button" variant="primary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button type="button" variant="primary" onClick={() => navigate("/")}>
                  Back to backlog
                </Button>
              )
            }
          />
        )}
      </div>

      <GameModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onGameRefresh={() => refresh({ silent: true })}
        readOnly
      />

      <ThoughtsEditModal
          game={editingGame}
          value={thoughtsDraft}
          onChange={(value) => {
            setThoughtsDraft(value);
            setEditFormError(null);
          }}
          onClose={closeThoughtsEditor}
          onSubmit={handleEditThoughts}
          error={editFormError}
          isSubmitting={isEditing}
        />
    </main>
  );
}
