import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { listWishlist } from "../../services/wishlistService.js";
import {
  EMPTY_WISHLIST,
  readWishlistCache,
  subscribeWishlistCache,
  wishlistCacheGeneration,
  wishlistCacheKey,
  writeWishlistCache,
} from "../../services/wishlistCache.js";
import { COLLECTION_BACKGROUND_PAGE_SIZE } from "../../utils/collectionLoading.js";

const REVALIDATE_MS = 60_000;
const pending = new Map();
const hydrationJobs = new Map();

function cancelHydration(key) {
  const job = hydrationJobs.get(key);
  if (!job) return;
  job.controller.abort();
  hydrationJobs.delete(key);
  const current = readWishlistCache(key);
  if (current.loadingMore) {
    writeWishlistCache(key, { ...current, loadingMore: false }, wishlistCacheGeneration());
  }
}

function sameRevision(current, page) {
  return String(current.snapshotVersion || "") === String(page.snapshotVersion || "") &&
    String(current.priceRevision || "") === String(page.priceRevision || "") &&
    Number(current.total || 0) === Number(page.total || 0);
}

export function appendWishlistPage(current, page) {
  if (!sameRevision(current, page)) {
    const error = new Error("Wishlist changed while loading. Refresh to continue.");
    error.code = "wishlist_revision_changed";
    throw error;
  }
  const items = [...(current.items || []), ...(page.items || [])];
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Wishlist paging returned duplicate items. Refresh to continue.");
  }
  return {
    items,
    hasMore: items.length < Number(page.total || 0),
  };
}

async function loadFirst(key, params, initialLimit, { preserveLoaded = false } = {}) {
  cancelHydration(key);
  const generation = wishlistCacheGeneration();
  const requestKey = `${generation}:${key}:first`;
  if (pending.has(requestKey)) return pending.get(requestKey);
  const previous = readWishlistCache(key);
  writeWishlistCache(key, { ...previous, loading: true, error: "", loadMoreError: "" }, generation);
  const promise = (async () => {
    try {
      const page = await listWishlist({ ...params, limit: initialLimit, offset: 0, include_summary: true });
      const firstItems = page.items || [];
      const canPreserve = preserveLoaded && previous.saved && sameRevision(previous, page);
      const items = canPreserve
        ? [...firstItems, ...previous.items.slice(firstItems.length)]
            .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
            .slice(0, Number(page.total || 0))
        : firstItems;
      writeWishlistCache(key, {
        ...page,
        items,
        saved: true,
        loading: false,
        loadingMore: false,
        hasMore: items.length < Number(page.total || 0),
        error: "",
        loadMoreError: "",
        validatedAt: Date.now(),
      }, generation);
    } catch (error) {
      writeWishlistCache(key, {
        ...readWishlistCache(key),
        loading: false,
        error: error.message || "Could not update saved Wishlist.",
        validatedAt: Date.now(),
      }, generation);
    } finally {
      pending.delete(requestKey);
    }
  })();
  pending.set(requestKey, promise);
  return promise;
}

async function loadNext(key, params) {
  const generation = wishlistCacheGeneration();
  if (hydrationJobs.has(key)) return hydrationJobs.get(key).promise;
  const current = readWishlistCache(key);
  if (!current.saved || current.loading || current.loadingMore || !current.hasMore) return;
  const controller = new AbortController();
  writeWishlistCache(key, { ...current, loadingMore: true, loadMoreError: "" }, generation);
  const promise = (async () => {
    try {
      let assembled = current;
      while (assembled.hasMore) {
        const page = await listWishlist({
          ...params,
          limit: COLLECTION_BACKGROUND_PAGE_SIZE,
          offset: assembled.items.length,
          include_summary: false,
        }, { signal: controller.signal });
        const appended = appendWishlistPage(assembled, page);
        if (appended.items.length === assembled.items.length) {
          throw new Error("Wishlist paging stopped before the collection was complete.");
        }
        assembled = { ...assembled, ...appended };
      }
      if (hydrationJobs.get(key)?.controller !== controller) return;
      writeWishlistCache(key, {
        ...assembled,
        loadingMore: false,
        loadMoreError: "",
        validatedAt: Date.now(),
      }, generation);
    } catch (error) {
      if (error?.name === "AbortError" || hydrationJobs.get(key)?.controller !== controller) return;
      writeWishlistCache(key, {
        ...readWishlistCache(key),
        loadingMore: false,
        loadMoreError: error.message || "Could not load more Wishlist items.",
      }, generation);
    } finally {
      if (hydrationJobs.get(key)?.controller === controller) hydrationJobs.delete(key);
    }
  })();
  hydrationJobs.set(key, { controller, promise });
  return promise;
}

export default function useInfiniteWishlist({ userId, enabled = true, membership = "active", params = {}, initialLimit = 12 }) {
  const active = enabled && !!userId;
  const paramsKey = JSON.stringify(params);
  const stableParams = useMemo(() => JSON.parse(paramsKey), [paramsKey]);
  const key = wishlistCacheKey(userId, membership, stableParams);
  const rawState = useSyncExternalStore(
    subscribeWishlistCache,
    useCallback(() => active ? readWishlistCache(key) : EMPTY_WISHLIST, [active, key]),
  );
  const previousRef = useRef({ userId: "", state: EMPTY_WISHLIST });
  const scope = String(userId || "");
  if (previousRef.current.userId !== scope) {
    previousRef.current = { userId: scope, state: EMPTY_WISHLIST };
  }
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
  const refresh = useCallback(
    (options) => active ? loadFirst(key, { ...stableParams, active: membership }, initialLimit, options) : Promise.resolve(),
    [active, initialLimit, key, membership, stableParams],
  );
  const loadMore = useCallback(
    () => active ? loadNext(key, { ...stableParams, active: membership }) : Promise.resolve(),
    [active, key, membership, stableParams],
  );

  useEffect(() => {
    if (active && rawState.saved && rawState.hasMore && !rawState.loading && !rawState.loadingMore && !rawState.loadMoreError) {
      void loadMore();
    }
  }, [active, loadMore, rawState.hasMore, rawState.loadMoreError, rawState.loading, rawState.loadingMore, rawState.saved]);

  useEffect(() => () => cancelHydration(key), [key]);

  useEffect(() => {
    if (!active) return;
    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      const value = readWishlistCache(key);
      if (!value.loading && !value.loadingMore && (!value.validatedAt || Date.now() - value.validatedAt >= REVALIDATE_MS)) {
        void refresh({ preserveLoaded: true });
      }
    };
    revalidate();
    const unsubscribe = subscribeWishlistCache(() => {
      if (readWishlistCache(key) !== EMPTY_WISHLIST) revalidate();
    });
    const timer = setInterval(revalidate, REVALIDATE_MS);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [active, key, refresh]);

  return { ...state, refresh, loadMore };
}
