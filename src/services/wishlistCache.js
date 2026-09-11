const entries = new Map();
const listeners = new Set();
let generation = 0;
export const EMPTY_WISHLIST = Object.freeze({
  items: [],
  total: 0,
  account: null,
  metadata: {},
  loading: false,
  error: "",
  saved: false,
});
export const wishlistCacheKey = (userId, membership = "active") =>
  JSON.stringify([String(userId), membership]);
export const wishlistCacheGeneration = () => generation;
export const readWishlistCache = (key) => entries.get(key) || EMPTY_WISHLIST;
export function writeWishlistCache(
  key,
  state,
  expectedGeneration = generation,
) {
  if (expectedGeneration !== generation) return;
  entries.set(key, state);
  while (entries.size > 12) entries.delete(entries.keys().next().value);
  listeners.forEach((listener) => listener());
}
export function subscribeWishlistCache(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function clearWishlistCache() {
  generation++;
  entries.clear();
  listeners.forEach((listener) => listener());
}
export function invalidateWishlistCache() {
  generation++;
  for (const [key, value] of entries)
    entries.set(key, { ...value, loading: false, validatedAt: 0 });
  listeners.forEach((listener) => listener());
}

export function reconcileWishlistConnection(userId, accountId) {
  for (const [key, value] of entries) {
    if (
      JSON.parse(key)[0] === String(userId) &&
      value.saved &&
      (value.account?.id ?? null) !== (accountId ?? null)
    ) {
      clearWishlistCache();
      return;
    }
  }
}
