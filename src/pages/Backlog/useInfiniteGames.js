import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { listGames, listGamesPage } from "../../services/gameService.js";
import { subscribeGamesInvalidation } from "../../services/gamesCache.js";
import { buildDisplayGames, splitCsv } from "../../utils/gameList.js";
import { hoursValueForList } from "../../utils/hours.js";
import { NO_PERSONAL_GENRE_FILTER, NO_RAWG_GENRE_FILTER } from "../../utils/filterOptions.js";

const PAGE_SIZE = 50;
const REVALIDATE_MS = 60_000;
const EMPTY = Object.freeze({ games: [], total: 0, loading: false, saved: false, error: "" });
const LOADING = Object.freeze({ ...EMPTY, loading: true });
const entries = new Map();
const listeners = new Set();
const pending = new Map();
const fullCollections = new Map();

const clientSortKeys = {
  name: "name", status: "status", personal_genres: "personalGenres",
  estimated_hours: "estimatedHours", score: "score", hours_played: "hoursPlayed",
  rawg_rating: "rawgRating", metacritic: "metacritic", release_date: "releaseDate",
  added_date: "addedDate", started_date: "startedDate", finished_date: "finishedDate", steam_last_played: "steamLastPlayed",
};

export function invalidateFullBacklogCollection(userId) {
  fullCollections.delete(String(userId || ""));
}

export async function getFullBacklogCollection(userId) {
  const scope = String(userId || "");
  const cached = fullCollections.get(scope);
  if (cached?.games && Date.now() - cached.fetchedAt < REVALIDATE_MS) return cached.games;
  if (cached?.promise) return cached.promise;
  const promise = listGames()
    .then((payload) => {
      const games = Array.isArray(payload) ? payload : payload?.games || [];
      fullCollections.set(scope, { games, fetchedAt: Date.now() });
      return games;
    })
    .catch((error) => {
      fullCollections.delete(scope);
      throw error;
    });
  fullCollections.set(scope, { promise });
  return promise;
}

function read(key) { return entries.get(key) || EMPTY; }
function write(key, value) {
  entries.set(key, value);
  while (entries.size > 12) entries.delete(entries.keys().next().value);
  listeners.forEach((listener) => listener());
}
function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

function normalizePage(payload) {
  if (!Array.isArray(payload)) return payload || {};
  return {
    games: payload,
    total: payload.length,
    snapshotVersion: null,
    facets: null,
  };
}

function fullCollectionFacets(games) {
  const genres = [...new Set(games.flatMap((game) => splitCsv(game.genres)))].sort((a, b) => a.localeCompare(b));
  const hours = games.map(hoursValueForList).map(Number).filter(Number.isFinite);
  return {
    collectionTotal: games.length,
    genres,
    hoursBounds: {
      min: hours.length ? Math.floor(Math.min(...hours)) : 0,
      max: hours.length ? Math.ceil(Math.max(...hours)) : 0,
    },
  };
}

async function loadSearchPage(userId, params) {
  const [collectionResult, serverResult] = await Promise.allSettled([
    getFullBacklogCollection(userId),
    listGamesPage({ ...params, limit: PAGE_SIZE, offset: 0, include_summary: true }),
  ]);
  if (collectionResult.status === "rejected" && serverResult.status === "rejected") {
    throw collectionResult.reason;
  }
  const collection = collectionResult.status === "fulfilled" ? collectionResult.value : [];
  const serverPage = serverResult.status === "fulfilled" ? normalizePage(serverResult.value) : {};
  const searchCollection = [...collection, ...(serverPage.games || [])]
    .filter((game, index, games) => games.findIndex((candidate) => candidate.id === game.id) === index);
  const facets = collection.length
    ? fullCollectionFacets(collection)
    : serverPage.facets || fullCollectionFacets(searchCollection);
  const hasHours = params.min_hours != null || params.max_hours != null;
  const games = buildDisplayGames({
    games: searchCollection,
    searchQuery: params.q,
    selectedStatuses: params.status || [],
    selectedGenres: [
      ...(params.genre || []),
      ...(params.no_genre ? [NO_RAWG_GENRE_FILTER] : []),
    ],
    selectedMyGenres: [
      ...(params.personal_genre || []),
      ...(params.no_personal_genre ? [NO_PERSONAL_GENRE_FILTER] : []),
    ],
    hoursRange: hasHours ? {
      min: Number(params.min_hours ?? facets.hoursBounds.min),
      max: Number(params.max_hours ?? facets.hoursBounds.max),
    } : null,
    hoursBounds: facets.hoursBounds,
    dateFilter: params.date_type ? {
      type: params.date_type,
      year: params.date_year,
      months: params.date_months,
    } : null,
    scoreFilter: params.score,
    ratedOnly: !!params.rated,
    sourceFilter: params.source || "all",
    rawgStatus: params.rawg_status || "all",
    missingEstimatesOnly: !!params.missing_estimates,
    sortKey: clientSortKeys[params.sort] || "",
    isReversed: params.direction === "desc",
  });
  return {
    games,
    total: games.length,
    snapshotVersion: `search:${games.map((game) => game.id).join(",")}`,
    facets,
  };
}

function sameSnapshot(current, page) {
  return String(current.snapshotVersion || "") === String(page.snapshotVersion || "") &&
    Number(current.total || 0) === Number(page.total || 0);
}

export function appendGamesPage(current, page) {
  if (!sameSnapshot(current, page)) {
    const error = new Error("Backlog changed while loading. Refresh to continue.");
    error.code = "backlog_revision_changed";
    throw error;
  }
  const games = [...(current.games || []), ...(page.games || [])];
  if (new Set(games.map((game) => game.id)).size !== games.length) {
    throw new Error("Backlog paging returned duplicate games. Refresh to continue.");
  }
  return { games, hasMore: (page.games || []).length > 0 && games.length < Number(page.total || 0) };
}

async function loadFirst(key, userId, params, { preserveLoaded = false, silent = false, force = false } = {}) {
  const requestKey = `${key}:first`;
  if (pending.has(requestKey)) {
    if (!force) return pending.get(requestKey);
    await pending.get(requestKey);
  }
  const previous = read(key);
  const keepLoadedPageVisible = (preserveLoaded || silent) && previous.saved;
  write(key, {
    ...previous,
    loading: !keepLoadedPageVisible,
    error: "",
    loadMoreError: "",
  });
  const promise = (async () => {
    try {
      const page = normalizePage(params.q
        ? await loadSearchPage(userId, params)
        : await listGamesPage({ ...params, limit: PAGE_SIZE, offset: 0, include_summary: true }));
      const firstGames = page.games || [];
      const canPreserve = preserveLoaded && previous.saved && sameSnapshot(previous, page);
      const games = canPreserve
        ? [...firstGames, ...previous.games.slice(firstGames.length)]
            .filter((game, index, all) => all.findIndex((candidate) => candidate.id === game.id) === index)
            .slice(0, Number(page.total || 0))
        : firstGames;
      write(key, { ...page, games, saved: true, loading: false, loadingMore: false, transitioning: false,
        hasMore: !params.q && firstGames.length > 0 && games.length < Number(page.total || 0), error: "", refreshError: "", loadMoreError: "", validatedAt: Date.now() });
    } catch (error) {
      const message = error.message || "Could not load the backlog.";
      write(key, keepLoadedPageVisible
        ? { ...read(key), loading: false, error: "", refreshError: message, validatedAt: Date.now() }
        : { ...read(key), loading: false, error: message, validatedAt: Date.now() });
    } finally { pending.delete(requestKey); }
  })();
  pending.set(requestKey, promise);
  return promise;
}

async function loadNext(key, params) {
  const requestKey = `${key}:next`;
  if (pending.has(requestKey)) return pending.get(requestKey);
  const current = read(key);
  if (!current.saved || current.loading || current.loadingMore || !current.hasMore) return;
  write(key, { ...current, loadingMore: true, loadMoreError: "" });
  const promise = (async () => {
    try {
      const page = normalizePage(await listGamesPage({ ...params, limit: PAGE_SIZE, offset: current.games.length, include_summary: false }));
      const appended = appendGamesPage(current, page);
      write(key, { ...current, ...appended, loadingMore: false, loadMoreError: "", validatedAt: Date.now() });
    } catch (error) {
      write(key, { ...read(key), loadingMore: false, loadMoreError: error.message || "Could not load more games." });
    } finally { pending.delete(requestKey); }
  })();
  pending.set(requestKey, promise);
  return promise;
}

export default function useInfiniteGames({ userId, enabled = true, params = {} }) {
  const active = enabled && !!userId;
  const paramsKey = JSON.stringify(params);
  const stableParams = useMemo(() => JSON.parse(paramsKey), [paramsKey]);
  const key = JSON.stringify([String(userId), stableParams]);
  const rawState = useSyncExternalStore(subscribe, useCallback(() => active ? (entries.get(key) || LOADING) : EMPTY, [active, key]));
  const previousRef = useRef({ userId: "", state: EMPTY });
  const scope = String(userId || "");
  if (previousRef.current.userId !== scope) previousRef.current = { userId: scope, state: EMPTY };
  if (rawState.saved) previousRef.current = { userId: scope, state: rawState };
  const state = active && !rawState.saved && previousRef.current.state.saved
    ? {
        ...previousRef.current.state,
        loading: rawState.loading,
        transitioning: rawState.loading,
        error: "",
        refreshError: rawState.error || "",
      }
    : rawState;
  const refresh = useCallback((options) => active ? loadFirst(key, userId, stableParams, options) : Promise.resolve(), [active, key, stableParams, userId]);
  const loadMore = useCallback(() => active ? loadNext(key, stableParams) : Promise.resolve(), [active, key, stableParams]);

  useEffect(() => {
    if (!active) return;
    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      const value = read(key);
      if (!value.loading && !value.loadingMore && (!value.validatedAt || Date.now() - value.validatedAt >= REVALIDATE_MS)) {
        void refresh({ preserveLoaded: true });
      }
    };
    revalidate();
    const timer = setInterval(revalidate, REVALIDATE_MS);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [active, key, refresh]);

  useEffect(() => subscribeGamesInvalidation((scope) => {
    if (active && String(userId) === scope) {
      invalidateFullBacklogCollection(userId);
      void refresh({ preserveLoaded: true, force: true });
    }
  }), [active, refresh, userId]);

  return { ...state, refresh, loadMore };
}
