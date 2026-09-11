import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { listAllWishlist } from '../../services/wishlistService';
import { EMPTY_WISHLIST, readWishlistCache, writeWishlistCache, wishlistCacheKey,
  wishlistCacheGeneration, subscribeWishlistCache } from '../../services/wishlistCache';

const pending = new Map();
const REVALIDATE_MS = 60_000;

async function load(key, membership) {
  const generation = wishlistCacheGeneration();
  const requestKey = `${generation}:${key}`;
  if (pending.has(requestKey)) return pending.get(requestKey);
  writeWishlistCache(key, { ...readWishlistCache(key), loading: true, error: '' }, generation);
  const promise = (async () => {
    try {
      const payload = await listAllWishlist({ active: membership, sort: 'provider_order' });
      writeWishlistCache(key, { ...payload, saved: true, loading: false, error: '', validatedAt: Date.now() }, generation);
    } catch (error) {
      writeWishlistCache(key, { ...readWishlistCache(key), loading: false, error: error.message || 'Could not update saved Wishlist.', validatedAt: Date.now() }, generation);
    } finally { pending.delete(requestKey); }
  })();
  pending.set(requestKey, promise);
  return promise;
}

export default function useWishlist({ userId, enabled = true, membership = 'active' }) {
  const active = enabled && !!userId;
  const key = wishlistCacheKey(userId, membership);
  const state = useSyncExternalStore(subscribeWishlistCache,
    useCallback(() => active ? readWishlistCache(key) : EMPTY_WISHLIST, [active, key]));
  const refresh = useCallback(() => active ? load(key, membership) : Promise.resolve(), [active, key, membership]);
  useEffect(() => {
    if (!active) return;
    const revalidate = () => {
      if (document.visibilityState === 'hidden') return;
      const value = readWishlistCache(key);
      if (!value.loading && (!value.validatedAt || Date.now() - value.validatedAt >= REVALIDATE_MS)) void refresh();
    };
    revalidate();
    const unsubscribe = subscribeWishlistCache(() => { if (readWishlistCache(key) !== EMPTY_WISHLIST) revalidate(); });
    const timer = setInterval(revalidate, REVALIDATE_MS);
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => { unsubscribe(); clearInterval(timer); window.removeEventListener('focus', revalidate); document.removeEventListener('visibilitychange', revalidate); };
  }, [active, key, refresh, state === EMPTY_WISHLIST]);
  return { ...state, refresh };
}
