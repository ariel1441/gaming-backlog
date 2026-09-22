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

const PAGE_SIZE = 50;
const REVALIDATE_MS = 60_000;
const pending = new Map();

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

async function loadFirst(key, params, { preserveLoaded = false } = {}) {
  const generation = wishlistCacheGeneration();
  const requestKey = `${generation}:${key}:first`;
  if (pending.has(requestKey)) return pending.get(requestKey);
  const previous = readWishlistCache(key);
  writeWishlistCache(key, { ...previous, loading: true, error: "", loadMoreError: "" }, generation);
  const promise = (async () => {
    try {
      const page = await listWishlist({ ...params, limit: PAGE_SIZE, offset: 0, include_summary: true });
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
  const requestKey = `${generation}:${key}:next`;
  if (pending.has(requestKey)) return pending.get(requestKey);
  const current = readWishlistCache(key);
  if (!current.saved || current.loading || current.loadingMore || !current.hasMore) return;
  writeWishlistCache(key, { ...current, loadingMore: true, loadMoreError: "" }, generation);
  const promise = (async () => {
    try {
      const page = await listWishlist({
        ...params,
        limit: PAGE_SIZE,
        offset: current.items.length,
        include_summary: false,
      });
      const appended = appendWishlistPage(current, page);
      writeWishlistCache(key, {
        ...current,
        items: appended.items,
        loadingMore: false,
        hasMore: appended.hasMore,
        loadMoreError: "",
        validatedAt: Date.now(),
      }, generation);
    } catch (error) {
      writeWishlistCache(key, {
        ...readWishlistCache(key),
        loadingMore: false,
        loadMoreError: error.message || "Could not load more Wishlist items.",
      }, generation);
    } finally {
      pending.delete(requestKey);
    }
  })();
  pending.set(requestKey, promise);
  return promise;
}

export default function useInfiniteWishlist({ userId, enabled = true, membership = "active", params = {} }) {
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
    (options) => active ? loadFirst(key, { ...stableParams, active: membership }, options) : Promise.resolve(),
    [active, key, membership, stableParams],
  );
  const loadMore = useCallback(
    () => active ? loadNext(key, { ...stableParams, active: membership }) : Promise.resolve(),
    [active, key, membership, stableParams],
  );

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
