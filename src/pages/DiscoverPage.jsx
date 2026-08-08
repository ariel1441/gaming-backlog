import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  Filter,
  Gamepad2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useGames } from "../hooks/useGames";
import { usePersonalGenres } from "../hooks/usePersonalGenres";
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
  markDiscoverGameInBacklog,
  readDiscoverResponse,
  replaceDiscoverCachedShelf,
  updateDiscoverCachedGame,
  writeDiscoverResponse,
} from "../services/discoverCache";
import {
  AppPage,
  PageError,
  PageHeader,
  PageSection,
  PageToolbar,
} from "../components/layout";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  SearchClearButton,
  SelectMenu,
  Skeleton,
  TextInput,
  Textarea,
  useToast,
} from "../components/ui";
import {
  CatalogCard,
  CatalogShelf,
  DetailModal,
} from "./Discover/DiscoverView";

const emptyAddDraft = {
  status: "plan to play",
  my_genre: "",
  personal_genres: [],
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

export default function DiscoverPage() {
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    getAuthHeaders,
  } = useAuth();
  const { upsertGame } = useGames();
  const { genres: personalGenres } = usePersonalGenres(isAuthenticated);
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
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState(emptyAddDraft);
  const catalogLoadSequence = useRef(0);
  const discoverUserKey = String(user?.id ?? user?.username ?? "");

  const canSearch = isAuthenticated && debouncedQuery.trim().length >= 3;
  const isBrowseMode = isAuthenticated && debouncedQuery.trim().length < 3;
  const hasBrowseFilters =
    filters.genre ||
    filters.releaseWindow !== "all" ||
    filters.backlog !== "all" ||
    filters.sort !== "recent";
  const showBrowseGrid = canSearch || hasBrowseFilters || !shelves.length;
  const statusList = useMemo(
    () =>
      statuses?.length ? statuses : ["plan to play", "playing", "finished"],
    [statuses],
  );

  useEffect(() => {
    if (authLoading || !isAuthenticated) return undefined;
    const sequence = catalogLoadSequence.current + 1;
    catalogLoadSequence.current = sequence;
    setLoadError("");
    if (debouncedQuery.trim().length > 0 && debouncedQuery.trim().length < 3) {
      setLoading(false);
      setResults([]);
      setShelves([]);
      setMessage("Type at least 3 characters to search the catalog.");
      return undefined;
    }
    setMessage("");
    if (isBrowseMode) {
      const cacheParams = { ...filters, page, limit: 24, shelfLimit: 24 };
      const cached = readDiscoverResponse({
        userKey: discoverUserKey,
        scope: "browse",
        params: cacheParams,
      });
      if (cached) {
        setResults(cached.results || []);
        setShelves(cached.shelves || []);
        setFacets(cached.facets || { genres: [] });
        setTotal(cached.total || 0);
        setTotalPages(cached.totalPages || 1);
        setCacheStatus(cached.cacheStatus || "fresh");
      }
      setLoading(!cached);
      browseCatalog(
        cacheParams,
        { auth: false, headers: getAuthHeaders() },
      )
        .then((payload) => {
          if (catalogLoadSequence.current !== sequence) return;
          writeDiscoverResponse({
            userKey: discoverUserKey,
            scope: "browse",
            params: cacheParams,
            payload,
          });
          setResults(payload?.results || []);
          setShelves(payload?.shelves || []);
          setFacets(payload?.facets || { genres: [] });
          setTotal(payload?.total || 0);
          setTotalPages(payload?.totalPages || 1);
          setCacheStatus(payload?.cacheStatus || "fresh");
          setMessage(
            payload?.results?.length || payload?.shelves?.length
              ? ""
              : "The local catalog is still empty. Search for a few games to start growing it.",
          );
        })
        .catch((error) => {
          if (catalogLoadSequence.current !== sequence) return;
          if (cached) {
            setCacheStatus("stale");
            return;
          }
          setResults([]);
          setShelves([]);
          setLoadError(error.message || "Could not load the catalog.");
        })
        .finally(() => {
          if (catalogLoadSequence.current === sequence) setLoading(false);
        });
      return undefined;
    }

    const ac = new AbortController();
    const cacheParams = { query: debouncedQuery.trim().toLowerCase() };
    const cached = readDiscoverResponse({
      userKey: discoverUserKey,
      scope: "search",
      params: cacheParams,
    });
    if (cached) {
      setResults(cached.results || []);
      setTotal(cached.results?.length || 0);
      setTotalPages(1);
      setCacheStatus(cached.cacheStatus || "fresh");
    }
    setLoading(!cached);
    setShelves([]);
    searchCatalog(debouncedQuery, {
      signal: ac.signal,
      auth: false,
      headers: getAuthHeaders(),
    })
      .then((payload) => {
        if (catalogLoadSequence.current !== sequence) return;
        writeDiscoverResponse({
          userKey: discoverUserKey,
          scope: "search",
          params: cacheParams,
          payload,
        });
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
        if (
          error.name !== "AbortError" &&
          catalogLoadSequence.current === sequence
        ) {
          if (cached) {
            setCacheStatus("stale");
            return;
          }
          setResults([]);
          setLoadError(error.message || "Could not search the catalog.");
        }
      })
      .finally(() => {
        if (catalogLoadSequence.current === sequence) setLoading(false);
      });
    return () => ac.abort();
  }, [
    authLoading,
    canSearch,
    debouncedQuery,
    discoverUserKey,
    filters,
    getAuthHeaders,
    isAuthenticated,
    isBrowseMode,
    page,
    retryKey,
  ]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const openGame = async (game) => {
    setDetailLoading(true);
    setSelected(game);
    setAddDraft({
      ...emptyAddDraft,
      how_long_to_beat: game.rawgPlaytimeHours
        ? String(game.rawgPlaytimeHours)
        : "",
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
      updateDiscoverCachedGame(discoverUserKey, detail);
      setResults((list) =>
        list.map((game) =>
          Number(game.id) === Number(detail.id) ? { ...game, ...detail } : game,
        ),
      );
      setShelves((list) =>
        list.map((shelf) => ({
          ...shelf,
          results: shelf.results.map((game) =>
            Number(game.id) === Number(detail.id)
              ? { ...game, ...detail }
              : game,
          ),
        })),
      );
      if (detail.cacheStatus === "stale") {
        toast.warning("Showing stored metadata because RAWG is unavailable.");
      } else {
        toast.success("Catalog metadata refreshed.");
      }
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
          addDraft.how_long_to_beat === ""
            ? null
            : Number(addDraft.how_long_to_beat),
        my_score: addDraft.my_score === "" ? null : Number(addDraft.my_score),
      };
      if (Array.isArray(payload.personal_genres)) delete payload.my_genre;
      const createdGame = await addCatalogGameToBacklog(selected.id, payload, {
        auth: false,
        headers: getAuthHeaders(),
      });
      upsertGame(createdGame);
      markDiscoverGameInBacklog(discoverUserKey, selected.id);
      toast.success("Game added to backlog.");
      setSelected((game) => ({ ...game, alreadyInBacklog: true }));
      if (isBrowseMode && filters.backlog === "not_in") {
        setResults((list) =>
          list.filter((game) => Number(game.id) !== Number(selected.id)),
        );
        const nextTotal = Math.max(total - 1, 0);
        setTotal(nextTotal);
        setTotalPages(Math.max(Math.ceil(nextTotal / 24), 1));
      } else {
        setResults((list) =>
          list.map((game) =>
            Number(game.id) === Number(selected.id)
              ? { ...game, alreadyInBacklog: true }
              : game,
          ),
        );
      }
      setShelves((list) =>
        list
          .map((shelf) => ({
            ...shelf,
            results: shelf.results.filter(
              (game) => Number(game.id) !== Number(selected.id),
            ),
          }))
          .filter((shelf) => shelf.results.length),
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
        replaceDiscoverCachedShelf(discoverUserKey, payload.shelf);
        setShelves((list) =>
          list.map((shelf) => (shelf.key === key ? payload.shelf : shelf)),
        );
        setExpandedShelves((current) => new Set(current).add(key));
      }
    } catch (error) {
      toast.warning(error.message || "Could not load more games right now.");
    } finally {
      setLoadingShelfKey("");
    }
  };

  if (authLoading) {
    return <DiscoverSkeleton />;
  }

  if (!isAuthenticated) {
    return (
      <AppPage width="full">
        <PageHeader
          title="Discover"
          description="Find games based on your backlog and preferences."
          icon={Compass}
        />
        <div className="pt-8">
          <EmptyState
            icon={Compass}
            title="Sign in to discover games."
            description="Catalog search is available for signed-in libraries so API usage stays tied to real backlog work."
            action={
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate("/")}
              >
                Back to backlog
              </Button>
            }
          />
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage width="full">
      <PageHeader
        title="Discover"
        description="Browse curated catalog shelves or search for something specific."
        icon={Compass}
      />
      <PageToolbar>
        <div className="relative min-w-0 w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
          <TextInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search games..."
            className="h-11 rounded-xl bg-surface-elevated/45 pl-10 pr-11"
          />
          {query ? (
            <SearchClearButton
              onClick={() => setQuery("")}
              label="Clear Discover search"
            />
          ) : null}
        </div>
      </PageToolbar>

      <PageSection className="pt-6">
        {isBrowseMode ? (
          <div className="mb-6 border-b border-surface-border pb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="discover-genre" label="Genre">
                <SelectMenu
                  id="discover-genre"
                  value={filters.genre}
                  placeholder="Any genre"
                  onChange={(genre) =>
                    setFilters((current) => ({ ...current, genre }))
                  }
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
                  onChange={(backlog) =>
                    setFilters((current) => ({ ...current, backlog }))
                  }
                  options={backlogOptions}
                />
              </Field>
              <Field id="discover-sort" label="Sort">
                <SelectMenu
                  id="discover-sort"
                  value={filters.sort}
                  onChange={(sort) =>
                    setFilters((current) => ({ ...current, sort }))
                  }
                  options={sortOptions}
                />
              </Field>
            </div>
            {hasBrowseFilters ? (
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="dangerGhost"
                  onClick={() =>
                    setFilters({
                      genre: "",
                      releaseWindow: "all",
                      backlog: "all",
                      sort: "recent",
                    })
                  }
                >
                  <X className="h-4 w-4" aria-hidden="true" />
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
              <Skeleton key={index} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : loadError ? (
          <PageError
            title={
              canSearch
                ? "Could not search the catalog."
                : "Could not load Discover."
            }
            description={loadError}
            onRetry={() => setRetryKey((value) => value + 1)}
          />
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
                        onClick={() =>
                          setPage((value) => Math.max(value - 1, 1))
                        }
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
                        onClick={() =>
                          setPage((value) => Math.min(value + 1, totalPages))
                        }
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
      </PageSection>

      <DetailModal
        game={selected}
        statuses={statusList}
        addDraft={addDraft}
        setAddDraft={setAddDraft}
        personalGenreOptions={personalGenres.map((genre) => genre.name)}
        adding={adding || detailLoading}
        refreshing={refreshing}
        onClose={() => setSelected(null)}
        onRefresh={refreshSelected}
        onAdd={addSelected}
        onOpenBacklog={() => navigate("/")}
      />
    </AppPage>
  );
}

function DiscoverSkeleton() {
  return (
    <AppPage width="full">
      <div
        className="space-y-6"
        role="status"
        aria-label="Loading Discover"
        aria-busy="true"
      >
        <PageHeader
          title="Discover"
          description="Browse curated catalog shelves or search for something specific."
          icon={Compass}
        />
        <Skeleton className="h-20 w-full rounded-panel" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-control" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    </AppPage>
  );
}
