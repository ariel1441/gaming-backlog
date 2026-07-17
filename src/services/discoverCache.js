export const DISCOVER_RESPONSE_TTL_MS = 90_000;

const MAX_CACHE_ENTRIES = 80;
const responseCache = new Map();

function normalizedUserKey(userKey) {
  return String(userKey ?? "").trim();
}

function normalizedParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function cacheKey(userKey, scope, params) {
  return JSON.stringify([
    normalizedUserKey(userKey),
    String(scope || ""),
    normalizedParams(params),
  ]);
}

function pruneOldestEntries() {
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey === undefined) return;
    responseCache.delete(oldestKey);
  }
}

export function readDiscoverResponse({
  userKey,
  scope,
  params,
  now = Date.now(),
} = {}) {
  const key = cacheKey(userKey, scope, params);
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (now - entry.writtenAt > DISCOVER_RESPONSE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.payload;
}

export function writeDiscoverResponse({
  userKey,
  scope,
  params,
  payload,
  now = Date.now(),
} = {}) {
  const normalizedKey = normalizedUserKey(userKey);
  if (!normalizedKey || !payload) return payload;
  const key = cacheKey(normalizedKey, scope, params);
  responseCache.delete(key);
  responseCache.set(key, {
    userKey: normalizedKey,
    scope: String(scope || ""),
    params: normalizedParams(params),
    payload,
    writtenAt: now,
  });
  pruneOldestEntries();
  return payload;
}

function matchesCatalogGame(game, catalogGameId) {
  return Number(game?.id ?? game?.catalog_game_id) === Number(catalogGameId);
}

function mapCatalogGame(list, catalogGameId, update) {
  if (!Array.isArray(list)) return list;
  return list.map((game) =>
    matchesCatalogGame(game, catalogGameId) ? update(game) : game,
  );
}

export function markDiscoverGameInBacklog(userKey, catalogGameId) {
  const normalizedKey = normalizedUserKey(userKey);
  for (const [key, entry] of responseCache) {
    if (entry.userKey !== normalizedKey) continue;

    if (entry.scope === "browse" && entry.params.backlog === "in") {
      responseCache.delete(key);
      continue;
    }

    const shouldRemove =
      entry.scope === "browse" && entry.params.backlog === "not_in";
    const results = shouldRemove
      ? entry.payload.results?.filter(
          (game) => !matchesCatalogGame(game, catalogGameId),
        )
      : mapCatalogGame(
          entry.payload.results,
          catalogGameId,
          (game) => ({ ...game, alreadyInBacklog: true }),
        );
    const shelves = entry.payload.shelves
      ?.map((shelf) => ({
        ...shelf,
        results: shelf.results?.filter(
          (game) => !matchesCatalogGame(game, catalogGameId),
        ),
      }))
      .filter((shelf) => shelf.results?.length);

    responseCache.set(key, {
      ...entry,
      payload: {
        ...entry.payload,
        ...(results ? { results } : {}),
        ...(shelves ? { shelves } : {}),
        ...(shouldRemove && Number.isFinite(Number(entry.payload.total))
          ? { total: Math.max(Number(entry.payload.total) - 1, 0) }
          : {}),
      },
    });
  }
}

export function updateDiscoverCachedGame(userKey, game) {
  const normalizedKey = normalizedUserKey(userKey);
  const catalogGameId = game?.id ?? game?.catalog_game_id;
  if (catalogGameId == null) return;

  for (const [key, entry] of responseCache) {
    if (entry.userKey !== normalizedKey) continue;
    const update = (current) => ({ ...current, ...game });
    responseCache.set(key, {
      ...entry,
      payload: {
        ...entry.payload,
        results: mapCatalogGame(
          entry.payload.results,
          catalogGameId,
          update,
        ),
        shelves: entry.payload.shelves?.map((shelf) => ({
          ...shelf,
          results: mapCatalogGame(shelf.results, catalogGameId, update),
        })),
      },
    });
  }
}

export function replaceDiscoverCachedShelf(userKey, shelf) {
  const normalizedKey = normalizedUserKey(userKey);
  if (!shelf?.key) return;
  for (const [key, entry] of responseCache) {
    if (entry.userKey !== normalizedKey || entry.scope !== "browse") continue;
    responseCache.set(key, {
      ...entry,
      payload: {
        ...entry.payload,
        shelves: entry.payload.shelves?.map((current) =>
          current.key === shelf.key ? shelf : current,
        ),
      },
    });
  }
}

export function clearDiscoverResponseCache(userKey) {
  const normalizedKey = normalizedUserKey(userKey);
  if (!normalizedKey) {
    responseCache.clear();
    return;
  }
  for (const [key, entry] of responseCache) {
    if (entry.userKey === normalizedKey) responseCache.delete(key);
  }
}
