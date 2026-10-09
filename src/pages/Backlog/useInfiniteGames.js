import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { listGames, listGamesPage } from "../../services/gameService.js";
import { subscribeGamesInvalidation } from "../../services/gamesCache.js";
import { buildDisplayGames, splitCsv } from "../../utils/gameList.js";
import { hoursValueForList } from "../../utils/hours.js";
import { NO_PERSONAL_GENRE_FILTER, NO_RAWG_GENRE_FILTER } from "../../utils/filterOptions.js";
import { applyRankOrder, optimisticRankOrder } from "../../utils/reorder.js";
import { COLLECTION_BACKGROUND_PAGE_SIZE } from "../../utils/collectionLoading.js";

const REVALIDATE_MS = 60_000;
const EMPTY = Object.freeze({ games: [], total: 0, loading: false, saved: false, error: "" });
const LOADING = Object.freeze({ ...EMPTY, loading: true });
const entries = new Map();
const listeners = new Set();
const pending = new Map();
const refreshJobs = new Map();
const hydrationJobs = new Map();
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

function cancelHydration(key) {
  const job = hydrationJobs.get(key);
  if (!job) return;
  job.controller.abort();
  hydrationJobs.delete(key);
  const current = read(key);
  if (current.loadingMore) write(key, { ...current, loadingMore: false });
}

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
    listGamesPage({ ...params, limit: COLLECTION_BACKGROUND_PAGE_SIZE, offset: 0, include_summary: true }),
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
    missingHltbOnly: !!params.missing_hltb,
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

// Build a replacement offscreen. Never combine pages from different revisions.
export async function assembleRefreshedGames(previous, page, fetchNext, preserveLoaded) {
  const firstGames = page.games || [];
  if (!preserveLoaded || !previous.saved) return firstGames;
  if (sameSnapshot(previous, page)) {
    return [...firstGames, ...previous.games.slice(firstGames.length)]
      .filter((game, index, all) => all.findIndex((candidate) => candidate.id === game.id) === index)
      .slice(0, Number(page.total || 0));
  }
  let assembled = { ...page, games: firstGames };
  const target = Math.min(previous.games.length, Number(page.total || 0));
  while (assembled.games.length < target) {
    const next = await fetchNext(assembled.games.length);
    const appended = appendGamesPage(assembled, next);
    if (appended.games.length === assembled.games.length) {
      throw new Error("Backlog paging stopped before the collection was complete.");
    }
    assembled = { ...assembled, ...appended };
  }
  return assembled.games;
}

function cancelRefresh(key) {
  refreshJobs.get(key)?.abort();
  refreshJobs.delete(key);
}

async function loadFirst(key, userId, params, initialLimit, { preserveLoaded = false, silent = false, force = false } = {}) {
  const requestKey = key + ":first";
  if (pending.has(requestKey)) {
    if (!force) return pending.get(requestKey);
    await pending.get(requestKey);
  }
  if (read(key).reordering) return;
  cancelHydration(key);
  const controller = new AbortController();
  refreshJobs.set(key, controller);
  const previous = read(key);
  const keepLoadedPageVisible = (preserveLoaded || silent) && previous.saved;
  write(key, { ...previous, loading: !keepLoadedPageVisible, refreshing: true, error: "", loadMoreError: "" });
  const promise = (async () => {
    try {
      const fetchPage = async (offset, limit, include_summary) => normalizePage(await listGamesPage({
        ...params, limit, offset, include_summary,
      }, { signal: controller.signal }));
      const page = params.q
        ? normalizePage(await loadSearchPage(userId, params))
        : await fetchPage(0, initialLimit, true);
      const games = await assembleRefreshedGames(previous, page,
        (offset) => fetchPage(offset, COLLECTION_BACKGROUND_PAGE_SIZE, false),
        preserveLoaded && !params.q);
      if (refreshJobs.get(key) !== controller) return;
      write(key, { ...page, games, saved: true, loading: false, refreshing: false, loadingMore: false, transitioning: false,
        hasMore: !params.q && games.length > 0 && games.length < Number(page.total || 0), error: "", refreshError: "", loadMoreError: "", validatedAt: Date.now() });
    } catch (error) {
      if (controller.signal.aborted || refreshJobs.get(key) !== controller) return;
      const message = error.message || "Could not load the backlog.";
      write(key, keepLoadedPageVisible
        ? { ...read(key), loading: false, refreshing: false, error: "", refreshError: message, validatedAt: Date.now() }
        : { ...read(key), loading: false, refreshing: false, error: message, validatedAt: Date.now() });
    } finally {
      if (refreshJobs.get(key) === controller) refreshJobs.delete(key);
      if (pending.get(requestKey) === promise) pending.delete(requestKey);
    }
  })();
  pending.set(requestKey, promise);
  return promise;
}

async function loadNext(key, params) {
  if (hydrationJobs.has(key)) return hydrationJobs.get(key).promise;
  const current = read(key);
  if (!current.saved || current.loading || current.refreshing || current.reordering || current.loadingMore || !current.hasMore) return;
  const controller = new AbortController();
  write(key, { ...current, loadingMore: true, loadMoreError: "" });
  const promise = (async () => {
    try {
      let assembled = current;
      while (assembled.hasMore) {
        const page = normalizePage(await listGamesPage({
          ...params,
          limit: COLLECTION_BACKGROUND_PAGE_SIZE,
          offset: assembled.games.length,
          include_summary: false,
        }, { signal: controller.signal }));
        const appended = appendGamesPage(assembled, page);
        if (appended.games.length === assembled.games.length) {
          throw new Error("Backlog paging stopped before the collection was complete.");
        }
        assembled = { ...assembled, ...appended };
      }
      if (hydrationJobs.get(key)?.controller !== controller) return;
      write(key, { ...assembled, loadingMore: false, loadMoreError: "", validatedAt: Date.now() });
    } catch (error) {
      if (error?.name === "AbortError" || hydrationJobs.get(key)?.controller !== controller) return;
      write(key, { ...read(key), loadingMore: false, loadMoreError: error.message || "Could not load more games." });
    } finally {
      if (hydrationJobs.get(key)?.controller === controller) hydrationJobs.delete(key);
    }
  })();
  hydrationJobs.set(key, { controller, promise });
  return promise;
}

export default function useInfiniteGames({ userId, enabled = true, params = {}, initialLimit = 12 }) {
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
  const refresh = useCallback((options) => active ? loadFirst(key, userId, stableParams, initialLimit, options) : Promise.resolve(), [active, initialLimit, key, stableParams, userId]);
  const reorder = useCallback(async (gameId, targetIndex, save) => {
    if (!active || read(key).reordering) return;
    cancelRefresh(key);
    cancelHydration(key);
    const previous = read(key);
    write(key, { ...previous, games: optimisticRankOrder(previous.games, gameId, targetIndex),
      reordering: true, refreshing: false, snapshotVersion: null });
    let payload;
    try {
      payload = await save();
    } catch (error) {
      // Restore even when the recovery GET also fails.
      write(key, { ...previous, games: [...previous.games], reordering: false, refreshing: false });
      throw error;
    }
    write(key, { ...read(key), games: applyRankOrder(read(key).games, payload), reordering: false });
    invalidateFullBacklogCollection(userId);
    await refresh({ preserveLoaded: true, silent: true, force: true });
    return payload;
  }, [active, key, refresh, userId]);
  const loadMore = useCallback(() => active ? loadNext(key, stableParams) : Promise.resolve(), [active, key, stableParams]);

  useEffect(() => {
    if (active && rawState.saved && rawState.hasMore && !rawState.loading && !rawState.refreshing && !rawState.reordering && !rawState.loadingMore && !rawState.loadMoreError) {
      void loadMore();
    }
  }, [active, loadMore, rawState.hasMore, rawState.loadMoreError, rawState.loading, rawState.refreshing, rawState.reordering, rawState.loadingMore, rawState.saved]);

  useEffect(() => () => cancelHydration(key), [key]);

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

  return { ...state, refresh, loadMore, reorder };
}
