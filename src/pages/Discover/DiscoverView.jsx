import { useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Gamepad2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  GameCover,
  Modal,
  SelectMenu,
  Textarea,
  TextInput,
} from "../../components/ui";
function cacheLabel(status) {
  if (status === "live") return "Live";
  if (status === "stale") return "Cached";
  if (status === "unavailable") return "Offline";
  return "Cached";
}

function cacheVariant(status) {
  if (status === "live") return "success";
  if (status === "stale") return "warning";
  if (status === "unavailable") return "danger";
  return "default";
}

function gameGenres(game) {
  if (Array.isArray(game?.genres)) return game.genres.join(", ");
  return game?.genresText || "";
}

export function CatalogCard({ game, onOpen, showCacheMeta = false }) {
  return (
    <article className="flex h-48 overflow-hidden rounded-lg border border-surface-border bg-surface-card/95 shadow-sm transition-colors hover:border-primary/35 hover:bg-surface-card">
      <button
        type="button"
        onClick={() => onOpen(game)}
        className="flex w-full min-w-0 text-left"
      >
        <div className="h-full w-32 shrink-0 bg-surface-elevated">
          <GameCover
            src={game.cover}
            name={game.name}
            className="h-full w-full"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h3
                className="line-clamp-2 text-base font-semibold text-content-primary"
                title={game.name}
              >
                {game.name}
              </h3>
              {game.alreadyInBacklog ? (
                <Badge variant="success">In backlog</Badge>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
              {game.releaseDate || game.released ? (
                <span>{game.releaseDate || game.released}</span>
              ) : null}
              {game.rating ? <span>{game.rating}/5 RAWG</span> : null}
              {game.metacritic ? <span>MC {game.metacritic}</span> : null}
            </div>
          </div>
          {gameGenres(game) ? (
            <p className="line-clamp-2 text-sm text-content-secondary">
              {gameGenres(game)}
            </p>
          ) : null}
          {showCacheMeta || game.rawgPlaytimeHours || game.steamOwned ? (
            <div className="mt-auto flex min-h-6 items-center justify-between gap-3 text-xs text-content-muted">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {showCacheMeta ? (
                  <span>{cacheLabel(game.cacheStatus)}</span>
                ) : null}
                {game.rawgPlaytimeHours ? (
                  <span>{game.rawgPlaytimeHours}h</span>
                ) : null}
              </div>
              {game.steamOwned ? (
                <span
                  className="inline-flex shrink-0 items-center text-primary-light"
                  title="Owned on Steam"
                  aria-label="Owned on Steam"
                >
                  <Gamepad2 className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-auto min-h-6" />
          )}
        </div>
      </button>
    </article>
  );
}

export function CatalogShelf({
  title,
  games,
  expanded,
  canLoadMore,
  loadingMore,
  onToggleExpanded,
  onLoadMore,
  onOpen,
}) {
  const rowRef = useRef(null);
  if (!games?.length) return null;
  const visibleGames = expanded ? games : games.slice(0, 8);
  const scrollBy = (direction) => {
    rowRef.current?.scrollBy({
      left: direction * 640,
      behavior: "smooth",
    });
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-light" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-content-primary">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {expanded && canLoadMore ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          ) : null}
          {games.length > 8 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleExpanded}
            >
              {expanded ? "Show less" : "Show more"}
            </Button>
          ) : canLoadMore ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="relative px-0 md:px-16">
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg border border-surface-border bg-surface-card/95 text-content-secondary shadow-xl transition hover:border-primary/35 hover:bg-surface-card hover:text-content-primary md:flex"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div
          ref={rowRef}
          className="grid auto-cols-[min(300px,calc(100vw-2rem))] grid-flow-col gap-4 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:thin] md:auto-cols-[minmax(300px,1fr)] xl:auto-cols-[calc((100%_-_48px)/4)]"
        >
          {visibleGames.map((game) => (
            <div key={`${title}-${game.id}`} className="min-w-0">
              <CatalogCard game={game} onOpen={onOpen} />
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-label={`Scroll ${title} right`}
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg border border-surface-border bg-surface-card/95 text-content-secondary shadow-xl transition hover:border-primary/35 hover:bg-surface-card hover:text-content-primary md:flex"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

export function DetailModal({
  game,
  statuses,
  addDraft,
  setAddDraft,
  adding,
  refreshing,
  onClose,
  onRefresh,
  onAdd,
  onOpenBacklog,
}) {
  if (!game) return null;
  const statusOptions = statuses.map((status) => ({
    value: status,
    label: status,
  }));
  return (
    <Modal
      title={game.name}
      description="Catalog metadata is cached locally and can be refreshed without changing your personal backlog data."
      onClose={onClose}
      size="3xl"
      bodyClassName="p-0"
    >
      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-surface-border bg-surface-bg/35 p-5 lg:border-b-0 lg:border-r">
          <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-elevated">
            <GameCover
              src={game.cover}
              name={game.name}
              alt={`${game.name || "Game"} cover`}
              decorative={false}
              className="h-96 w-full"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant={cacheVariant(game.cacheStatus)}>
              {cacheLabel(game.cacheStatus)}
            </Badge>
            {game.metadataQuality ? (
              <Badge>{game.metadataQuality}</Badge>
            ) : null}
            {game.alreadyInBacklog ? (
              <Badge variant="success">In backlog</Badge>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-4 w-full justify-center"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {refreshing ? "Refreshing..." : "Refresh metadata"}
          </Button>
        </aside>
        <div className="space-y-5 p-5">
          <section className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Released"
              value={game.releaseDate || game.released || "Unknown"}
            />
            <Stat
              label="RAWG"
              value={game.rating ? `${game.rating}/5` : "N/A"}
            />
            <Stat label="Metacritic" value={game.metacritic || "N/A"} />
            <Stat
              label="Estimate"
              value={
                game.rawgPlaytimeHours
                  ? `${game.rawgPlaytimeHours}h`
                  : "Unknown"
              }
            />
          </section>

          {gameGenres(game) ? (
            <section>
              <h3 className="text-sm font-semibold text-content-primary">
                Genres
              </h3>
              <p className="mt-2 text-sm leading-6 text-content-secondary">
                {gameGenres(game)}
              </p>
            </section>
          ) : null}

          {game.description ? (
            <section>
              <h3 className="text-sm font-semibold text-content-primary">
                Overview
              </h3>
              <div
                className="prose prose-invert mt-2 max-w-none rounded-xl border border-surface-border bg-surface-bg/35 p-4 text-sm leading-7 text-content-secondary"
                dangerouslySetInnerHTML={{ __html: game.description }}
              />
            </section>
          ) : null}

          <section className="rounded-xl border border-surface-border bg-surface-bg/35 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-content-primary">
                  {game.alreadyInBacklog
                    ? "Already in backlog"
                    : "Add to backlog"}
                </h3>
                <p className="mt-1 text-xs text-content-muted">
                  {game.alreadyInBacklog
                    ? "This catalog game is already linked to your library."
                    : "Personal fields stay separate from catalog metadata."}
                </p>
              </div>
              {game.alreadyInBacklog ? (
                <Badge variant="success">Already added</Badge>
              ) : null}
            </div>
            {game.alreadyInBacklog ? (
              <div className="rounded-lg border border-surface-border bg-surface-elevated/35 p-4">
                <p className="text-sm text-content-secondary">
                  It will stay out of the main recommendation shelves, but you
                  can still find it through search or filters.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4"
                  onClick={onOpenBacklog}
                >
                  Open backlog
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="discover-add-status" label="Status">
                    <SelectMenu
                      id="discover-add-status"
                      value={addDraft.status}
                      onChange={(status) =>
                        setAddDraft((draft) => ({ ...draft, status }))
                      }
                      options={statusOptions}
                    />
                  </Field>
                  <Field
                    id="discover-add-my-genre"
                    label="My genres"
                  >
                    <TextInput
                      id="discover-add-my-genre"
                      value={addDraft.my_genre}
                      onChange={(event) =>
                        setAddDraft((draft) => ({
                          ...draft,
                          my_genre: event.target.value,
                        }))
                      }
                      placeholder="RPG, Action..."
                    />
                  </Field>
                  <Field id="discover-add-hours" label="Hours">
                    <TextInput
                      id="discover-add-hours"
                      type="number"
                      min="0"
                      max="1000"
                      value={addDraft.how_long_to_beat}
                      onChange={(event) =>
                        setAddDraft((draft) => ({
                          ...draft,
                          how_long_to_beat: event.target.value,
                        }))
                      }
                      placeholder={
                        game.rawgPlaytimeHours
                          ? String(game.rawgPlaytimeHours)
                          : "Optional"
                      }
                    />
                  </Field>
                  <Field id="discover-add-my-score" label="My Score">
                    <TextInput
                      id="discover-add-my-score"
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={addDraft.my_score}
                      onChange={(event) =>
                        setAddDraft((draft) => ({
                          ...draft,
                          my_score: event.target.value,
                        }))
                      }
                      placeholder="0-10"
                    />
                  </Field>
                  <Field
                    id="discover-add-thoughts"
                    label="Thoughts"
                    className="sm:col-span-2"
                  >
                    <Textarea
                      id="discover-add-thoughts"
                      rows={3}
                      value={addDraft.thoughts}
                      onChange={(event) =>
                        setAddDraft((draft) => ({
                          ...draft,
                          thoughts: event.target.value,
                        }))
                      }
                      placeholder="Why this belongs on the backlog..."
                    />
                  </Field>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={onAdd}
                    disabled={adding}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {adding ? "Adding..." : "Add to backlog"}
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-bg/35 p-3">
      <div className="text-xs uppercase tracking-wide text-content-muted">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-content-primary">
        {value}
      </div>
    </div>
  );
}
