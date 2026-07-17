import {
  ArrowDownAZ,
  ArrowUpAZ,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Pencil,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  AppPage,
  PageHeader,
  PageToolbar,
} from "../../components/layout";
import {
  Badge,
  Button,
  Chip,
  Field,
  GameCover,
  IconButton,
  Modal,
  SearchClearButton,
  SelectMenu,
  Skeleton,
  StatusBadge,
  Textarea,
  TextInput,
} from "../../components/ui";
import { resolveGameHours } from "../../utils/hours";
import {
  formatReviewDate,
  formatReviewScore,
  reviewGenres,
  reviewText,
} from "../../utils/reviews";

export const reviewFilterOptions = [
  { value: "all", label: "All reviews" },
  { value: "completed", label: "Completed" },
  { value: "notCompleted", label: "Not completed" },
];

export const reviewSortOptions = [
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
      <span className="text-base font-semibold text-content-primary">
        {value}
      </span>
      <span className="text-xs uppercase tracking-[0.18em] text-content-secondary">
        {label}
      </span>
    </div>
  );
}

export function ReviewsSkeleton() {
  return (
    <AppPage width="wide">
      <div
        className="space-y-5"
        role="status"
        aria-label="Loading reviews"
        aria-busy="true"
      >
        <PageHeader
          title="Reviews"
          description="Games where you wrote thoughts, notes, or a personal review."
          icon={MessageSquareText}
        />
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-40 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-panel" />
        <div className="grid gap-5 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex min-h-72 flex-col gap-4 rounded-2xl border border-surface-border bg-surface-card/60 p-3 sm:flex-row sm:gap-5"
            >
              <Skeleton className="h-56 w-full shrink-0 rounded-2xl sm:h-auto sm:w-48 lg:w-52" />
              <div className="flex-1 space-y-4 py-3">
                <Skeleton className="h-7 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-24 rounded-full" />
                  <Skeleton className="h-7 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
                <div className="flex flex-wrap gap-2 pt-3">
                  <Skeleton className="h-7 w-28 rounded-full" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                  <Skeleton className="h-7 w-24 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppPage>
  );
}

export function ReviewsHeader({ summary }) {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Games where you wrote thoughts, notes, or a personal review."
        icon={MessageSquareText}
      />
      <div className="mt-5 flex flex-wrap gap-3">
        <StatPill
          icon={MessageSquareText}
          label="Reviews"
          value={summary.total}
        />
        <StatPill
          icon={CheckCircle2}
          label="Completed"
          value={summary.completed}
        />
        <StatPill
          icon={Clock3}
          label="Not completed"
          value={summary.notCompleted}
        />
        <StatPill icon={Star} label="Avg score" value={summary.averageScore} />
      </div>
    </>
  );
}

export function ReviewsControls({
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
    <PageToolbar>
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
            className="pl-9 pr-11"
          />
          {search ? (
            <SearchClearButton
              onClick={() => setSearch("")}
              label="Clear review search"
            />
          ) : null}
        </label>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex flex-wrap gap-2">
            {reviewFilterOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={
                  reviewFilter === option.value
                    ? "filterActive"
                    : "secondary"
                }
                onClick={() => setReviewFilter(option.value)}
                aria-pressed={reviewFilter === option.value}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <SelectMenu
            value={sortKey}
            onChange={setSortKey}
            options={reviewSortOptions}
            className="w-full min-w-44 sm:w-56"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsReversed(!isReversed)}
            aria-label={`Sort direction: ${
              isReversed ? "ascending" : "descending"
            }. Change to ${isReversed ? "descending" : "ascending"}.`}
            className="shrink-0 whitespace-nowrap"
          >
            {isReversed ? (
              <ArrowUpAZ className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />
            )}
            {isReversed ? "Ascending" : "Descending"}
          </Button>
          {hasActiveFilters ? (
            <Button
              type="button"
              size="sm"
              variant="dangerGhost"
              onClick={onClear}
            >
              <X className="h-4 w-4" aria-hidden="true" /> Clear filters
            </Button>
          ) : null}
        </div>
      </div>
    </PageToolbar>
  );
}

function ReviewMedia({ game }) {
  const src =
    typeof game?.cover === "string" && game.cover.trim() ? game.cover : null;
  const initials = String(game?.name || "Game")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <div className="relative h-56 w-full shrink-0 overflow-hidden rounded-2xl border border-surface-border bg-surface-elevated shadow-panel sm:h-auto sm:min-h-72 sm:w-48 sm:self-stretch lg:w-52">
      <GameCover
        src={src}
        name={game?.name || initials}
        className="h-full w-full"
        imageClassName="object-center transition duration-500 group-hover:scale-[1.03]"
      />
    </div>
  );
}

export function ReviewCard({ game, onOpen, onEdit }) {
  const hours = resolveGameHours(game);
  const finished = formatReviewDate(game.finished_at);
  const started = formatReviewDate(game.started_at);
  const score = formatReviewScore(game.my_score);
  const { myGenres } = reviewGenres(game);
  return (
    <article className="group relative min-w-0 rounded-2xl border border-surface-border bg-surface-card/80 p-3 shadow-sm transition hover:border-primary/45 hover:bg-surface-card hover:shadow-glow-primary">
      <div className="absolute right-4 top-4 z-20 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
        <IconButton
          icon={Pencil}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(game);
          }}
          className="action-button h-9 w-9 shadow-md hover:border-secondary hover:bg-secondary hover:text-content-on-primary"
          label="Edit thoughts"
          title="Edit thoughts"
        />
      </div>
      <button
        type="button"
        onClick={() => onOpen(game)}
        className="block h-full w-full min-w-0 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg"
      >
        <div className="flex h-full flex-col gap-4 sm:flex-row sm:gap-5">
          <ReviewMedia game={game} />
          <div className="flex min-w-0 flex-1 flex-col py-1 pr-11 sm:min-h-72">
            <div className="min-w-0">
              <h2
                className="line-clamp-2 text-2xl font-semibold leading-snug text-content-primary"
                title={game.name}
              >
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
              {finished ? (
                <Badge variant="success">Finished {finished}</Badge>
              ) : null}
              {!finished && started ? (
                <Badge variant="warning">Started {started}</Badge>
              ) : null}
              {hours.hours ? (
                <Badge variant={hours.isActual ? "integration" : "success"}>
                  {hours.label}
                </Badge>
              ) : null}
              {myGenres.map((genre) => (
                <Chip key={`my-${genre}`} variant="personalGenre">
                  {genre}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}

export function ThoughtsEditModal({
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
      size="2xl"
      bodyClassName="p-5 sm:p-6"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="review-thoughts-form"
            variant="primary"
            disabled={isSubmitting}
          >
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
