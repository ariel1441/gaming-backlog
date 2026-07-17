function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds);
}

export function nextCatalogRefreshAt(catalogGame, now = new Date()) {
  const releasedAt = catalogGame?.released_at ?? catalogGame?.releasedAt;
  const release = releasedAt ? new Date(releasedAt) : null;
  const day = 24 * 60 * 60 * 1000;

  if (!release || Number.isNaN(release.getTime())) {
    return addMilliseconds(now, 30 * day);
  }
  if (release > now) return addMilliseconds(now, 7 * day);
  if (release >= addMilliseconds(now, -180 * day)) {
    return addMilliseconds(now, 21 * day);
  }
  return addMilliseconds(now, 120 * day);
}

export function nextCatalogRefreshRetryAt(attempt, now = new Date()) {
  const exponent = Math.max(0, Math.min(Number(attempt || 1) - 1, 5));
  const delay = Math.min(
    6 * 60 * 60 * 1000 * 2 ** exponent,
    7 * 24 * 60 * 60 * 1000,
  );
  return addMilliseconds(now, delay);
}
