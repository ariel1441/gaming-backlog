export const COLLECTION_BACKGROUND_PAGE_SIZE = 100;

const DESKTOP_INITIAL_LIMITS = Object.freeze({
  grid: 12,
  compact: 18,
  list: 8,
  table: 20,
});

const MOBILE_INITIAL_LIMITS = Object.freeze({
  grid: 4,
  compact: 6,
  list: 5,
  table: 5,
});

export function collectionInitialLimit(viewMode, isDesktop) {
  const limits = isDesktop ? DESKTOP_INITIAL_LIMITS : MOBILE_INITIAL_LIMITS;
  return limits[viewMode] || limits.grid;
}
