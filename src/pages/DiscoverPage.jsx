import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useStatuses } from "../hooks/useStatuses";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  addCatalogGameToBacklog,
  browseCatalog,
  getCatalogGame,
  loadMoreCatalogCollection,
  refreshCatalogGame,
  searchCatalog,
} from "../services/catalogService";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  SelectMenu,
  TextInput,
  Textarea,
  useToast,
} from "../components/ui";

const emptyAddDraft = {
  status: "plan to play",
  my_genre: "",
  thoughts: "",
  my_score: "",
  how_long_to_beat: "",
};

const sortOptions = [
  { value: "recent", label: "Recently added" },
  { value: "rating", label: "RAWG rating" },
  { value: "metacritic", label: "Metacritic" },
  { value: "release_desc", label: "Newest release" },
  { value: "release_asc", label: "Oldest release" },
  { value: "title", label: "Title" },
];

const releaseOptions = [
  { value: "all", label: "Any release" },
  { value: "upcoming", label: "Upcoming" },
  { value: "recent", label: "Recent" },
  { value: "older", label: "Older" },
  { value: "unknown", label: "Unknown date" },
];

const backlogOptions = [
  { value: "all", label: "All catalog" },
  { value: "not_in", label: "Not in backlog" },
  { value: "in", label: "In backlog" },
];

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

function CatalogCard({ game, onOpen, showCacheMeta = false }) {
  return (
    <article className="flex h-48 overflow-hidden rounded-lg border border-surface-border bg-surface-card/95 shadow-sm transition-colors hover:border-primary/35 hover:bg-surface-card">
      <button
        type="button"
        onClick={() => onOpen(game)}
        className="flex w-full min-w-0 text-left"
      >
        <div className="h-full w-32 shrink-0 bg-surface-elevated">
          {game.cover ? (
            <img
              src={game.cover}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-content-muted">
              {String(game.name || "?").charAt(0)}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h3 className="line-clamp-2 text-base font-semibold text-content-primary">
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
          {showCacheMeta || game.rawgPlaytimeHours ? (
            <div className="mt-auto flex min-h-6 flex-wrap items-center gap-2 text-xs text-content-muted">
              {showCacheMeta ? <span>{cacheLabel(game.cacheStatus)}</span> : null}
              {game.rawgPlaytimeHours ? <span>{game.rawgPlaytimeHours}h estimate</span> : null}
            </div>
          ) : (
            <div className="mt-auto min-h-6" />
          )}
        </div>
      </button>
    </article>
  );
}

function CatalogShelf({
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
          <h2 className="text-sm font-semibold text-content-primary">{title}</h2>
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
            <Button type="button" variant="ghost" size="sm" onClick={onToggleExpanded}>
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
      <div className="relative px-16">
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
          className="grid auto-cols-[minmax(300px,1fr)] grid-flow-col gap-4 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:thin] xl:auto-cols-[calc((100%_-_48px)/4)]"
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

function DetailModal({
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
  const statusOptions = statuses.map((status) => ({ value: status, label: status }));
  return (
    <Modal
      title={game.name}
      description="Catalog metadata is cached locally and can be refreshed without changing your personal backlog data."
      onClose={onClose}
      maxWidth="max-w-5xl"
      bodyClassName="p-0"
    >
      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-surface-border bg-surface-bg/35 p-5 lg:border-b-0 lg:border-r">
          <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-elevated">
            {game.cover ? (
              <img src={game.cover} alt="" className="h-96 w-full object-cover" />
            ) : (
              <div className="flex h-96 items-center justify-center text-4xl font-semibold text-content-muted">
                {String(game.name || "?").charAt(0)}
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant={cacheVariant(game.cacheStatus)}>
              {cacheLabel(game.cacheStatus)}
            </Badge>
            {game.metadataQuality ? <Badge>{game.metadataQuality}</Badge> : null}
            {game.alreadyInBacklog ? <Badge variant="success">In backlog</Badge> : null}
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
            <Stat label="Released" value={game.releaseDate || game.released || "Unknown"} />
            <Stat label="RAWG" value={game.rating ? `${game.rating}/5` : "N/A"} />
            <Stat label="Metacritic" value={game.metacritic || "N/A"} />
            <Stat
              label="Estimate"
              value={game.rawgPlaytimeHours ? `${game.rawgPlaytimeHours}h` : "Unknown"}
            />
          </section>

          {gameGenres(game) ? (
            <section>
              <h3 className="text-sm font-semibold text-content-primary">Genres</h3>
              <p className="mt-2 text-sm leading-6 text-content-secondary">
                {gameGenres(game)}
              </p>
            </section>
          ) : null}

          {game.description ? (
            <section>
              <h3 className="text-sm font-semibold text-content-primary">Overview</h3>
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
                  {game.alreadyInBacklog ? "Already in backlog" : "Add to backlog"}
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
                  It will stay out of the main recommendation shelves, but you can still find it through search or filters.
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
                  <Field id="discover-add-my-genre" label="My Genre">
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
                      placeholder={game.rawgPlaytimeHours ? String(game.rawgPlaytimeHours) : "Optional"}
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
                  <Field id="discover-add-thoughts" label="Thoughts" className="sm:col-span-2">
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
      <div className="text-xs uppercase tracking-wide text-content-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-content-primary">
        {value}
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  const { isAuthenticated, loading: authLoading, getAuthHeaders } = useAuth();
  const { statuses } = useStatuses();
  const toast = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 500);
  const [results, setResults] = useState([]);
  const [shelves, setShelves] = useState([]);
  const [expandedShelves, setExpandedShelves] = useState(() => new Set());
  const [loadingShelfKey, setLoadingShelfKey] = useState("");
  const [facets, setFacets] = useState({ genres: [] });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    genre: "",
    releaseWindow: "all",
    backlog: "all",
    sort: "recent",
  });
  const [cacheStatus, setCacheStatus] = useState("fresh");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState(emptyAddDraft);

  const canSearch = isAuthenticated && debouncedQuery.trim().length >= 3;
  const isBrowseMode = isAuthenticated && debouncedQuery.trim().length < 3;
  const hasBrowseFilters =
    filters.genre ||
    filters.releaseWindow !== "all" ||
    filters.backlog !== "all" ||
    filters.sort !== "recent";
  const showBrowseGrid = canSearch || hasBrowseFilters || !shelves.length;
  const statusList = useMemo(
    () => (statuses?.length ? statuses : ["plan to play", "playing", "finished"]),
    [statuses]
  );

  useEffect(() => {
    if (authLoading || !isAuthenticated) return undefined;
    if (debouncedQuery.trim().length > 0 && debouncedQuery.trim().length < 3) {
      setResults([]);
      setShelves([]);
      setMessage("Type at least 3 characters to search the catalog.");
      return undefined;
    }
    if (isBrowseMode) {
      setLoading(true);
      browseCatalog(
        { ...filters, page, limit: 24, shelfLimit: 24 },
        { auth: false, headers: getAuthHeaders() }
      )
        .then((payload) => {
          setResults(payload?.results || []);
          setShelves(payload?.shelves || []);
          setFacets(payload?.facets || { genres: [] });
          setTotal(payload?.total || 0);
          setTotalPages(payload?.totalPages || 1);
          setCacheStatus(payload?.cacheStatus || "fresh");
          setMessage(
            payload?.results?.length || payload?.shelves?.length
              ? ""
              : "The local catalog is still empty. Search for a few games to start growing it."
          );
        })
        .catch(() => {
          setResults([]);
          setShelves([]);
          setMessage("Catalog cache is empty. Search for a game to begin.");
        })
        .finally(() => setLoading(false));
      return undefined;
    }

    const ac = new AbortController();
    setLoading(true);
    setMessage("");
    setShelves([]);
    searchCatalog(debouncedQuery, {
      signal: ac.signal,
      auth: false,
      headers: getAuthHeaders(),
    })
      .then((payload) => {
        setResults(payload?.results || []);
        setTotal(payload?.results?.length || 0);
        setTotalPages(1);
        setCacheStatus(payload?.cacheStatus || "fresh");
        if (payload?.cacheStatus === "unavailable") {
          setMessage("Live catalog search is temporarily unavailable.");
        } else if (!payload?.results?.length) {
          setMessage("No catalog matches found.");
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setResults([]);
          setMessage(error.message || "Could not search the catalog.");
        }
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [
    authLoading,
    canSearch,
    debouncedQuery,
    filters,
    getAuthHeaders,
    isAuthenticated,
    isBrowseMode,
    page,
  ]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const openGame = async (game) => {
    setDetailLoading(true);
    setSelected(game);
    setAddDraft({
      ...emptyAddDraft,
      how_long_to_beat: game.rawgPlaytimeHours ? String(game.rawgPlaytimeHours) : "",
    });
    try {
      const detail = await getCatalogGame(game.id, {
        auth: false,
        headers: getAuthHeaders(),
      });
      setSelected(detail);
      setAddDraft((draft) => ({
        ...draft,
        how_long_to_beat: detail.rawgPlaytimeHours
          ? String(detail.rawgPlaytimeHours)
          : draft.how_long_to_beat,
      }));
    } catch (error) {
      toast.warning(error.message || "Showing cached catalog data.");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    setRefreshing(true);
    try {
      const detail = await refreshCatalogGame(selected.id, {
        auth: false,
        headers: getAuthHeaders(),
      });
      setSelected(detail);
      toast.success("Catalog metadata refreshed.");
    } catch (error) {
      toast.warning(error.message || "Could not refresh metadata right now.");
    } finally {
      setRefreshing(false);
    }
  };

  const addSelected = async () => {
    if (!selected) return;
    setAdding(true);
    try {
      const payload = {
        ...addDraft,
        how_long_to_beat:
          addDraft.how_long_to_beat === "" ? null : Number(addDraft.how_long_to_beat),
        my_score: addDraft.my_score === "" ? null : Number(addDraft.my_score),
      };
      await addCatalogGameToBacklog(selected.id, payload, {
        auth: false,
        headers: getAuthHeaders(),
      });
      toast.success("Game added to backlog.");
      setSelected((game) => ({ ...game, alreadyInBacklog: true }));
      setResults((list) =>
        list.map((game) =>
          Number(game.id) === Number(selected.id)
            ? { ...game, alreadyInBacklog: true }
            : game
        )
      );
      setShelves((list) =>
        list
          .map((shelf) => ({
            ...shelf,
            results: shelf.results.filter(
              (game) => Number(game.id) !== Number(selected.id)
            ),
          }))
          .filter((shelf) => shelf.results.length)
      );
    } catch (error) {
      toast.error(error.message || "Could not add this game.");
    } finally {
      setAdding(false);
    }
  };

  const loadMoreShelf = async (key) => {
    setLoadingShelfKey(key);
    try {
      const payload = await loadMoreCatalogCollection(key, {
        auth: false,
        headers: getAuthHeaders(),
      });
      if (payload?.shelf) {
        setShelves((list) =>
          list.map((shelf) => (shelf.key === key ? payload.shelf : shelf))
        );
        setExpandedShelves((current) => new Set(current).add(key));
      }
    } catch (error) {
      toast.warning(error.message || "Could not load more games right now.");
    } finally {
      setLoadingShelfKey("");
    }
  };

  if (!authLoading && !isAuthenticated) {
    return (
      <main className="min-h-screen bg-surface-bg px-4 py-6 text-content-primary sm:px-6">
        <EmptyState
          icon={Compass}
          title="Sign in to discover games."
          description="Catalog search is available for signed-in libraries so API usage stays tied to real backlog work."
          action={
            <Button type="button" variant="primary" onClick={() => navigate("/")}>
              Back to backlog
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-bg px-4 py-5 text-content-primary sm:px-6">
      <header className="sticky top-0 z-30 -mx-4 border-b border-surface-border bg-surface-bg/95 px-4 pb-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Backlog
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-surface-border bg-surface-elevated/70 text-content-secondary">
              <Compass className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Discover</h1>
              <p className="text-xs text-content-muted">
                Browse curated catalog shelves or search RAWG when you need something specific.
              </p>
            </div>
          </div>
          <div className="relative min-w-[260px] flex-1 md:max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
            <TextInput
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search games..."
              className="h-11 rounded-xl bg-surface-elevated/45 pl-10"
            />
          </div>
          {canSearch ? (
            <Badge variant={cacheVariant(cacheStatus)}>
              <Database className="mr-1 h-3 w-3" aria-hidden="true" />
              {cacheLabel(cacheStatus)}
            </Badge>
          ) : null}
        </div>
      </header>

      <section className="mx-auto mt-5 max-w-7xl">
        {isBrowseMode ? (
          <div className="mb-6 border-b border-surface-border pb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-content-primary">
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  Catalog tools
                </div>
                <p className="mt-1 text-xs text-content-muted">
                  Filters use local catalog data only.
                </p>
              </div>
              <div className="text-xs text-content-muted">
                {total} cached {total === 1 ? "game" : "games"}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="discover-genre" label="Genre">
                <SelectMenu
                  id="discover-genre"
                  value={filters.genre}
                  placeholder="Any genre"
                  onChange={(genre) => setFilters((current) => ({ ...current, genre }))}
                  options={[
                    { value: "", label: "Any genre" },
                    ...(facets.genres || []).map((genre) => ({
                      value: genre.genre,
                      label: `${genre.genre} (${genre.count})`,
                    })),
                  ]}
                />
              </Field>
              <Field id="discover-release" label="Release">
                <SelectMenu
                  id="discover-release"
                  value={filters.releaseWindow}
                  onChange={(releaseWindow) =>
                    setFilters((current) => ({ ...current, releaseWindow }))
                  }
                  options={releaseOptions}
                />
              </Field>
              <Field id="discover-backlog" label="Backlog">
                <SelectMenu
                  id="discover-backlog"
                  value={filters.backlog}
                  onChange={(backlog) => setFilters((current) => ({ ...current, backlog }))}
                  options={backlogOptions}
                />
              </Field>
              <Field id="discover-sort" label="Sort">
                <SelectMenu
                  id="discover-sort"
                  value={filters.sort}
                  onChange={(sort) => setFilters((current) => ({ ...current, sort }))}
                  options={sortOptions}
                />
              </Field>
            </div>
            {hasBrowseFilters ? (
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setFilters({
                      genre: "",
                      releaseWindow: "all",
                      backlog: "all",
                      sort: "recent",
                    })
                  }
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {message ? (
          <div className="mb-4 rounded-xl border border-surface-border bg-surface-card px-4 py-3 text-sm text-content-secondary">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-xl border border-surface-border bg-surface-card"
              />
            ))}
          </div>
        ) : results.length || shelves.length ? (
          <div className="space-y-8">
            {isBrowseMode && !hasBrowseFilters && shelves.length ? (
              <div className="space-y-7">
                {shelves.map((shelf) => (
                  <CatalogShelf
                    key={shelf.key}
                    title={shelf.title}
                    games={shelf.results}
                    expanded={expandedShelves.has(shelf.key)}
                    canLoadMore={shelf.results.length < 96}
                    loadingMore={loadingShelfKey === shelf.key}
                    onToggleExpanded={() =>
                      setExpandedShelves((current) => {
                        const next = new Set(current);
                        if (next.has(shelf.key)) next.delete(shelf.key);
                        else next.add(shelf.key);
                        return next;
                      })
                    }
                    onLoadMore={() => loadMoreShelf(shelf.key)}
                    onOpen={openGame}
                  />
                ))}
              </div>
            ) : null}

            {results.length && showBrowseGrid ? (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-content-primary">
                    {canSearch ? "Search results" : "Browse results"}
                  </h2>
                  {isBrowseMode && totalPages > 1 ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((value) => Math.max(value - 1, 1))}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-content-muted">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((value) => Math.min(value + 1, totalPages))}
                      >
                        Next
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {results.map((game) => (
                    <CatalogCard
                      key={game.id}
                      game={game}
                      onOpen={openGame}
                      showCacheMeta={canSearch}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <EmptyState
            icon={Compass}
            title="Start growing the catalog."
            description="Search for games like hades, zelda, persona, or baldur. Results are saved locally for future browsing."
          />
        )}
      </section>

      <DetailModal
        game={selected}
        statuses={statusList}
        addDraft={addDraft}
        setAddDraft={setAddDraft}
        adding={adding || detailLoading}
        refreshing={refreshing}
        onClose={() => setSelected(null)}
        onRefresh={refreshSelected}
        onAdd={addSelected}
        onOpenBacklog={() => navigate("/")}
      />
    </main>
  );
}
