function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds);
}

export const CATALOG_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function nextCatalogRefreshAt(_catalogGame, now = new Date()) {
  return addMilliseconds(now, CATALOG_REFRESH_MS);
}

// Successful legacy rows may still have the former 21/120-day due date.
// Adopt weekly freshness without a backfill, but never shorten failure backoff.
export const CATALOG_REFRESH_DUE_SQL = `CASE
  WHEN catalog.metadata_failed_at IS NOT NULL THEN
    COALESCE(catalog.metadata_next_refresh_at, catalog.metadata_failed_at + INTERVAL '24 hours')
  ELSE LEAST(catalog.metadata_next_refresh_at,
             catalog.metadata_fetched_at + INTERVAL '7 days')
END`;

export function nextCatalogRefreshRetryAt(attempt, now = new Date()) {
  const exponent = Math.max(0, Math.min(Number(attempt || 1) - 1, 5));
  const delay = Math.min(
    6 * 60 * 60 * 1000 * 2 ** exponent,
    7 * 24 * 60 * 60 * 1000,
  );
  return addMilliseconds(now, delay);
}
