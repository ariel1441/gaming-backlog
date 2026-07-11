import { pool } from "../db.js";
import {
  fetchGameDataByIdOrSlug,
  fetchRAWGGames,
  searchRAWGGames,
} from "../utils/fetchRAWG.js";
import { sanitizeGameHtml } from "../utils/sanitizeHtml.js";
import { toHourInt } from "../utils/time.js";

export const SEARCH_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const FAILED_RETRY_MS = 24 * 60 * 60 * 1000;
export const MANUAL_REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const COLLECTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PROVIDER = "rawg";
const inflight = new Map();
const DEFAULT_COLLECTION_LIMIT = 24;
const DEFAULT_COLLECTION_FETCH_MULTIPLIER = 3;
const MAX_COLLECTION_GAMES = 96;
const COLLECTION_SCHEDULER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const CATALOG_COLLECTIONS = [
  {
    key: "trending",
    title: "Trending And Popular",
    description: "Broadly popular games from RAWG, refreshed slowly.",
    params: { ordering: "-added" },
    minAdded: 1000,
    requireCover: true,
  },
  {
    key: "top_rated",
    title: "Highly Rated",
    description: "Strong RAWG and Metacritic signals.",
    params: { ordering: "-metacritic" },
    minAdded: 750,
    minRatings: 30,
    requireCover: true,
  },
  {
    key: "new_releases",
    title: "New Releases",
    description: "Recently released games with enough catalog signal.",
    params: { ordering: "-added" },
    dateWindow: "recent",
    minAdded: 75,
    requireCover: true,
  },
  {
    key: "upcoming",
    title: "Upcoming",
    description: "Future releases to keep an eye on.",
    params: { ordering: "released" },
    dateWindow: "upcoming",
    minAdded: 20,
    requireCover: true,
  },
  {
    key: "popular_rpg",
    title: "Popular RPG",
    description: "Role-playing games from the seeded catalog.",
    params: { genres: "role-playing-games-rpg", ordering: "-added" },
    minAdded: 500,
    requireCover: true,
  },
  {
    key: "popular_action",
    title: "Popular Action",
    description: "Action games from the seeded catalog.",
    params: { genres: "action", ordering: "-added" },
    minAdded: 750,
    requireCover: true,
  },
  {
    key: "popular_indie",
    title: "Popular Indie",
    description: "Indie games from the seeded catalog.",
    params: { genres: "indie", ordering: "-added" },
    minAdded: 300,
    requireCover: true,
  },
  {
    key: "popular_strategy",
    title: "Popular Strategy",
    description: "Strategy games from the seeded catalog.",
    params: { genres: "strategy", ordering: "-added" },
    minAdded: 300,
    requireCover: true,
  },
];

export function normalizeQueryKey(query) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function daysMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function collectionParams(collection) {
  const params = { ...(collection.params || {}) };
  const now = new Date();
  if (collection.dateWindow === "recent") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 6);
    params.dates = `${isoDate(start)},${isoDate(now)}`;
  } else if (collection.dateWindow === "upcoming") {
    const end = new Date(now);
    end.setMonth(end.getMonth() + 12);
    params.dates = `${isoDate(now)},${isoDate(end)}`;
  }
  return params;
}

function isFutureDate(value) {
  const date = parseDate(value);
  return date ? date.getTime() > Date.now() : false;
}

function isReleasedWithin(value, days) {
  const date = parseDate(value);
  if (!date) return false;
  const age = Date.now() - date.getTime();
  return age >= 0 && age <= daysMs(days);
}

export function metadataStaleMs(game) {
  if (isFutureDate(game?.released_at)) return daysMs(7);
  if (isReleasedWithin(game?.released_at, 90)) return daysMs(30);
  return daysMs(180);
}

function isFullMetadataFresh(game) {
  if (!game || game.metadata_quality !== "full" || !game.metadata_fetched_at) {
    return false;
  }
  const fetched = new Date(game.metadata_fetched_at).getTime();
  return (
    Number.isFinite(fetched) && Date.now() - fetched < metadataStaleMs(game)
  );
}

function canRetryFailure(game) {
  if (!game?.metadata_failed_at) return true;
  const failed = new Date(game.metadata_failed_at).getTime();
  return Number.isFinite(failed) && Date.now() - failed >= FAILED_RETRY_MS;
}

function jsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rawgHours(rawg) {
  return toHourInt(
    rawg?.playtime ??
      rawg?.time_to_beat?.main ??
      rawg?.time_to_beat?.main_story ??
      rawg?.playtime_hours ??
      rawg?.average_playtime,
  );
}

function rawgGenres(rawg) {
  return Array.isArray(rawg?.genres)
    ? rawg.genres.map((genre) => genre?.name).filter(Boolean)
    : [];
}

function rawgStores(rawg) {
  return Array.isArray(rawg?.stores)
    ? rawg.stores
        .map((entry) => ({
          id: entry?.store?.id ?? entry?.store_id ?? entry?.id ?? null,
          name: entry?.store?.name ?? entry?.store_name ?? entry?.name ?? "",
          url: entry?.url ?? "",
        }))
        .filter((store) => store.name)
    : [];
}

function rawgTags(rawg) {
  return Array.isArray(rawg?.tags)
    ? rawg.tags
        .map((tag) => tag?.name)
        .filter(Boolean)
        .slice(0, 40)
    : [];
}

function passesCollectionQuality(result, collection) {
  if (!result?.rawg_id || !result?.name) return false;
  if (collection.requireCover && !result.cover) return false;
  if (collection.minAdded && Number(result.added || 0) < collection.minAdded) {
    return false;
  }
  if (
    collection.minRatings &&
    Number(result.ratings_count || 0) < collection.minRatings
  ) {
    return false;
  }
  if (collection.key === "top_rated" && !result.metacritic && !result.rating) {
    return false;
  }
  return true;
}

function sortCollectionCandidates(results, collection) {
  const dated = [...results];
  if (collection.key === "new_releases") {
    dated.sort(
      (a, b) =>
        (parseDate(b.released)?.getTime() || 0) -
        (parseDate(a.released)?.getTime() || 0),
    );
  } else if (collection.key === "upcoming") {
    dated.sort(
      (a, b) =>
        (parseDate(a.released)?.getTime() || Number.MAX_SAFE_INTEGER) -
        (parseDate(b.released)?.getTime() || Number.MAX_SAFE_INTEGER),
    );
  }
  return dated;
}

function normalizeRawgSearchResult(result) {
  return {
    rawgId: result?.rawg_id ?? result?.id ?? null,
    rawgSlug: result?.rawg_slug ?? result?.slug ?? null,
    name: result?.name || "",
    slug: result?.rawg_slug ?? result?.slug ?? null,
    coverUrl: result?.cover ?? result?.background_image ?? null,
    releasedAt: result?.released ?? null,
    rawgRating:
      typeof result?.rating === "number" && result.rating > 0
        ? result.rating
        : null,
    metacritic:
      typeof result?.metacritic === "number" && result.metacritic > 0
        ? result.metacritic
        : null,
    rawgPlaytimeHours: rawgHours(result),
    genres: rawgGenres(result),
    stores: rawgStores(result),
    tags: rawgTags(result),
    descriptionHtml: null,
    metadataQuality: "search_result",
    metadataSource: PROVIDER,
  };
}

function normalizeRawgDetail(rawg) {
  return {
    ...normalizeRawgSearchResult(rawg),
    rawgId: rawg?.id ?? rawg?.rawg_id ?? null,
    rawgSlug: rawg?.slug ?? rawg?.rawg_slug ?? null,
    descriptionHtml: sanitizeGameHtml(rawg?.description),
    metadataQuality: "full",
    metadataSource: PROVIDER,
  };
}

function mapCatalogRow(
  row,
  { cacheStatus = "fresh", alreadyInBacklog = false } = {},
) {
  if (!row) return null;
  const genres = jsonArray(row.genres_json);
  const stores = jsonArray(row.stores_json);
  const tags = jsonArray(row.tags_json);
  const rawgId = row.rawg_external_id ? Number(row.rawg_external_id) : null;
  const rawgSlug = row.rawg_external_slug || row.slug || "";
  return {
    id: row.id,
    catalog_game_id: row.id,
    rawg_id: Number.isFinite(rawgId) ? rawgId : null,
    rawgId: Number.isFinite(rawgId) ? rawgId : null,
    rawg_slug: rawgSlug,
    rawgSlug,
    name: row.name,
    canonicalTitle: row.canonical_title || row.name,
    slug: row.slug,
    cover: row.cover_url,
    cover_url: row.cover_url,
    released: row.released_at,
    releaseDate: row.released_at,
    description: row.description_html,
    rating: row.rawg_rating == null ? null : Number(row.rawg_rating),
    rawgRating: row.rawg_rating == null ? null : Number(row.rawg_rating),
    metacritic: row.metacritic,
    rawgPlaytimeHours: row.rawg_playtime_hours,
    genres,
    stores,
    tags,
    genresText: genres.join(", "),
    metadataQuality: row.metadata_quality,
    metadataSource: row.metadata_source,
    metadataFetchedAt: row.metadata_fetched_at,
    metadataFailedAt: row.metadata_failed_at,
    metadataFailureReason: row.metadata_failure_reason,
    cacheStatus,
    metadata_status: cacheStatus,
    alreadyInBacklog,
    steamOwned: !!row.steam_owned,
    steamAppId: row.steam_external_id || null,
  };
}

function steamSourceMatchesCatalog(sourceAlias, userParamIndex) {
  return `(
    ${sourceAlias}.catalog_game_id = cg.id OR
    EXISTS (
      SELECT 1
      FROM games steam_game
      WHERE steam_game.id = ${sourceAlias}.game_id
        AND ${ownedCatalogPredicate("steam_game", userParamIndex)}
    ) OR
    EXISTS (
      SELECT 1
      FROM steam_import_candidates steam_candidate
      WHERE steam_candidate.user_id = ${sourceAlias}.user_id
        AND steam_candidate.steam_app_id = ${sourceAlias}.provider_app_id
        AND COALESCE(
          steam_candidate.user_selected_catalog_game_id,
          steam_candidate.proposed_catalog_game_id
        ) = cg.id
    )
  )`;
}

export function steamOwnedSelect(userParamIndex) {
  const sourceMatches = steamSourceMatchesCatalog("steam_src", userParamIndex);
  return `
           EXISTS (
             SELECT 1
             FROM user_game_sources steam_src
             WHERE steam_src.user_id = $${userParamIndex}
               AND steam_src.provider = 'steam'
               AND steam_src.source_status = 'owned'
               AND ${sourceMatches}
           ) AS steam_owned,
           (
             SELECT steam_src.provider_app_id
             FROM user_game_sources steam_src
             WHERE steam_src.user_id = $${userParamIndex}
               AND steam_src.provider = 'steam'
               AND steam_src.source_status = 'owned'
               AND ${sourceMatches}
             ORDER BY
               (steam_src.catalog_game_id = cg.id) DESC,
               steam_src.last_synced_at DESC NULLS LAST,
               steam_src.id DESC
             LIMIT 1
           ) AS steam_external_id`;
}

function ownedCatalogPredicate(alias, userParam) {
  const normalizeSql = (value) => {
    const normalized = `trim(regexp_replace(translate(lower(${value}), '''' || chr(8217) || chr(8216) || chr(700), ''), '[^a-z0-9]+', ' ', 'g'))`;
    return `
      trim(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(' ' || ${normalized} || ' ', ' vii ', ' 7 '),
                  ' vi ',
                  ' 6 '
                ),
                ' v ',
                ' 5 '
              ),
              ' iv ',
              ' 4 '
            ),
            ' iii ',
            ' 3 '
          ),
          ' ii ',
          ' 2 '
        )
      )
    `;
  };
  return `(
    ${alias}.catalog_game_id = cg.id OR
    (${alias}.rawg_id IS NOT NULL AND e.external_id = ${alias}.rawg_id::text) OR
    (
      ${alias}.rawg_id IS NULL AND
      ${alias}.catalog_game_id IS NULL AND
      ${normalizeSql(`${alias}.name`)} = ${normalizeSql("cg.name")}
    )
  ) AND ${alias}.user_id = $${userParam}`;
}

async function selectCatalogById(id, userId) {
  const { rows } = await pool.query(
    `
    SELECT cg.*,
           e.external_id AS rawg_external_id,
           e.slug AS rawg_external_slug,
           ${steamOwnedSelect(2)},
           EXISTS (
             SELECT 1 FROM games g
             WHERE ${ownedCatalogPredicate("g", 2)}
           ) AS already_in_backlog
    FROM catalog_games cg
    LEFT JOIN external_game_ids e
      ON e.catalog_game_id = cg.id AND e.source = 'rawg'
    WHERE cg.id = $1
    `,
    [id, userId || null],
  );
  return rows[0] || null;
}

async function selectCatalogByExternal(source, externalId) {
  const { rows } = await pool.query(
    `
    SELECT cg.*
    FROM catalog_games cg
    JOIN external_game_ids e ON e.catalog_game_id = cg.id
    WHERE e.source = $1 AND e.external_id = $2
    LIMIT 1
    `,
    [source, String(externalId)],
  );
  return rows[0] || null;
}

async function upsertCatalogFromRawgData(data) {
  if (!data?.rawgId || !data?.name) return null;

  const existing = await selectCatalogByExternal(PROVIDER, String(data.rawgId));
  if (existing) {
    const fullIncoming = data.metadataQuality === "full";
    const keepExistingFull =
      existing.metadata_quality === "full" && data.metadataQuality !== "full";
    if (keepExistingFull) return existing;

    const { rows } = await pool.query(
      `
      UPDATE catalog_games
         SET name = $2,
             canonical_title = $3,
             slug = $4,
             cover_url = COALESCE($5, cover_url),
             released_at = $6,
             description_html = CASE WHEN $13 THEN $7 ELSE description_html END,
             rawg_rating = $8,
             metacritic = $9,
             rawg_playtime_hours = $10,
             genres_json = $11::jsonb,
             stores_json = CASE WHEN $13 THEN $12::jsonb ELSE stores_json END,
             tags_json = CASE WHEN $13 THEN $14::jsonb ELSE tags_json END,
             metadata_quality = CASE WHEN $13 THEN 'full' ELSE metadata_quality END,
             metadata_source = 'rawg',
             metadata_fetched_at = CASE WHEN $13 THEN NOW() ELSE metadata_fetched_at END,
             metadata_failed_at = NULL,
             metadata_failure_reason = NULL,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *
      `,
      [
        existing.id,
        data.name,
        data.name,
        data.slug,
        data.coverUrl,
        data.releasedAt,
        data.descriptionHtml,
        data.rawgRating,
        data.metacritic,
        data.rawgPlaytimeHours,
        JSON.stringify(data.genres || []),
        JSON.stringify(data.stores || []),
        fullIncoming,
        JSON.stringify(data.tags || []),
      ],
    );
    await pool.query(
      `
      UPDATE external_game_ids
         SET slug = COALESCE($3, slug), updated_at = NOW()
       WHERE source = $1 AND external_id = $2
      `,
      [PROVIDER, String(data.rawgId), data.rawgSlug],
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `
    WITH inserted AS (
      INSERT INTO catalog_games (
        name,
        canonical_title,
        slug,
        cover_url,
        released_at,
        description_html,
        rawg_rating,
        metacritic,
        rawg_playtime_hours,
        genres_json,
        stores_json,
        tags_json,
        metadata_quality,
        metadata_source,
        metadata_fetched_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10::jsonb, $11::jsonb, $12::jsonb, $13, 'rawg',
        CASE WHEN $13 = 'full' THEN NOW() ELSE NULL END
      )
      RETURNING *
    ),
    external_insert AS (
      INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
      SELECT id, 'rawg', $14, $15 FROM inserted
      ON CONFLICT (source, external_id) DO NOTHING
    )
    SELECT * FROM inserted
    `,
    [
      data.name,
      data.name,
      data.slug,
      data.coverUrl,
      data.releasedAt,
      data.descriptionHtml,
      data.rawgRating,
      data.metacritic,
      data.rawgPlaytimeHours,
      JSON.stringify(data.genres || []),
      JSON.stringify(data.stores || []),
      JSON.stringify(data.tags || []),
      data.metadataQuality,
      String(data.rawgId),
      data.rawgSlug,
    ],
  );
  return rows[0] || selectCatalogByExternal(PROVIDER, String(data.rawgId));
}

async function markCatalogFailure(catalogGameId, reason) {
  if (!catalogGameId) return;
  await pool.query(
    `
    UPDATE catalog_games
       SET metadata_failed_at = NOW(),
           metadata_failure_reason = $2,
           updated_at = NOW()
     WHERE id = $1
    `,
    [catalogGameId, reason],
  );
}

async function fetchRawgDetailCoalesced(rawgIdOrSlug) {
  const key = `detail:${rawgIdOrSlug}`;
  if (!inflight.has(key)) {
    inflight.set(
      key,
      fetchGameDataByIdOrSlug(rawgIdOrSlug).finally(() => inflight.delete(key)),
    );
  }
  return inflight.get(key);
}

async function searchRawgCoalesced(query) {
  const key = `search:${normalizeQueryKey(query)}`;
  if (!inflight.has(key)) {
    inflight.set(
      key,
      searchRAWGGames(query, { pageSize: 12 }).finally(() =>
        inflight.delete(key),
      ),
    );
  }
  return inflight.get(key);
}

async function catalogRowsForIds(ids, userId) {
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `
    SELECT cg.*,
           e.external_id AS rawg_external_id,
           e.slug AS rawg_external_slug,
           ${steamOwnedSelect(2)},
           EXISTS (
             SELECT 1 FROM games g
             WHERE ${ownedCatalogPredicate("g", 2)}
           ) AS already_in_backlog
    FROM catalog_games cg
    LEFT JOIN external_game_ids e
      ON e.catalog_game_id = cg.id AND e.source = 'rawg'
    WHERE cg.id = ANY($1::int[])
    `,
    [ids, userId || null],
  );
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  return ids.map((id) => byId.get(Number(id))).filter(Boolean);
}

async function getSearchCache(queryKey) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM catalog_search_cache
    WHERE provider = 'rawg' AND query_key = $1
    `,
    [queryKey],
  );
  return rows[0] || null;
}

function cacheFresh(cache) {
  return cache?.expires_at && new Date(cache.expires_at).getTime() > Date.now();
}

function catalogSelectSql(userParamIndex) {
  return `
    SELECT cg.*,
           e.external_id AS rawg_external_id,
           e.slug AS rawg_external_slug,
           ${steamOwnedSelect(userParamIndex)},
           EXISTS (
             SELECT 1 FROM games g
             WHERE ${ownedCatalogPredicate("g", userParamIndex)}
           ) AS already_in_backlog
    FROM catalog_games cg
    LEFT JOIN external_game_ids e
      ON e.catalog_game_id = cg.id AND e.source = 'rawg'
  `;
}

function browseOrder(sort) {
  switch (sort) {
    case "title":
      return "LOWER(cg.name) ASC, cg.id ASC";
    case "release_desc":
      return "cg.released_at DESC NULLS LAST, cg.updated_at DESC, cg.id DESC";
    case "release_asc":
      return "cg.released_at ASC NULLS LAST, cg.updated_at DESC, cg.id DESC";
    case "rating":
      return "cg.rawg_rating DESC NULLS LAST, cg.metacritic DESC NULLS LAST, cg.updated_at DESC";
    case "metacritic":
      return "cg.metacritic DESC NULLS LAST, cg.rawg_rating DESC NULLS LAST, cg.updated_at DESC";
    case "recent":
    default:
      return "cg.updated_at DESC, cg.id DESC";
  }
}

function browseWhere(filters, userId, { includeUserParam = false } = {}) {
  const params = includeUserParam ? [userId || null] : [];
  const where = [];

  if (filters.genre) {
    params.push(filters.genre);
    where.push(`cg.genres_json ? $${params.length}`);
  }

  if (filters.releaseWindow === "upcoming") {
    where.push("cg.released_at > CURRENT_DATE");
  } else if (filters.releaseWindow === "recent") {
    where.push(
      "cg.released_at <= CURRENT_DATE AND cg.released_at >= CURRENT_DATE - INTERVAL '1 year'",
    );
  } else if (filters.releaseWindow === "older") {
    where.push("cg.released_at < CURRENT_DATE - INTERVAL '1 year'");
  } else if (filters.releaseWindow === "unknown") {
    where.push("cg.released_at IS NULL");
  }

  if (filters.backlog === "in") {
    if (!includeUserParam) params.push(userId || null);
    const userParam = includeUserParam ? 1 : params.length;
    where.push(
      `EXISTS (SELECT 1 FROM games g WHERE ${ownedCatalogPredicate("g", userParam)})`,
    );
  } else if (filters.backlog === "not_in") {
    if (!includeUserParam) params.push(userId || null);
    const userParam = includeUserParam ? 1 : params.length;
    where.push(
      `NOT EXISTS (SELECT 1 FROM games g WHERE ${ownedCatalogPredicate("g", userParam)})`,
    );
  }

  return { params, where };
}

async function browseCatalogRows(
  filters,
  userId,
  { limit = 24, offset = 0 } = {},
) {
  const { params, where } = browseWhere(filters, userId, {
    includeUserParam: true,
  });
  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `
    ${catalogSelectSql(1)}
    ${whereSql}
    ORDER BY ${browseOrder(filters.sort)}
    LIMIT $${limitParam}
    OFFSET $${offsetParam}
    `,
    params,
  );
  return rows;
}

async function browseCatalogCount(filters, userId) {
  const { params, where } = browseWhere(filters, userId);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM catalog_games cg
    LEFT JOIN external_game_ids e
      ON e.catalog_game_id = cg.id AND e.source = 'rawg'
    ${whereSql}
    `,
    params,
  );
  return rows[0]?.total || 0;
}

async function catalogGenreFacets() {
  const { rows } = await pool.query(
    `
    SELECT genre, COUNT(*)::int AS count
    FROM catalog_games cg
    CROSS JOIN LATERAL jsonb_array_elements_text(cg.genres_json) AS genre
    WHERE genre <> ''
    GROUP BY genre
    ORDER BY count DESC, genre ASC
    LIMIT 16
    `,
  );
  return rows;
}

async function collectionRows(userId, { limit = 8, key = "" } = {}) {
  const resultLimit = Math.min(
    Math.max(Number(limit) || 8, 1),
    MAX_COLLECTION_GAMES,
  );
  const params = [userId || null, MAX_COLLECTION_GAMES];
  const where = [
    `NOT EXISTS (
      SELECT 1 FROM games owned
      WHERE ${ownedCatalogPredicate("owned", 1)}
    )`,
  ];
  if (key) {
    params.push(key);
    where.unshift(`c.key = $${params.length}`);
  }
  const { rows } = await pool.query(
    `
    SELECT c.id AS collection_id,
           c.key AS collection_key,
           c.title AS collection_title,
           c.description AS collection_description,
           c.fetched_at AS collection_fetched_at,
           c.expires_at AS collection_expires_at,
           ccg.rank AS collection_rank,
           cg.*,
           e.external_id AS rawg_external_id,
           e.slug AS rawg_external_slug,
           ${steamOwnedSelect(1)},
           EXISTS (
             SELECT 1 FROM games g
             WHERE ${ownedCatalogPredicate("g", 1)}
           ) AS already_in_backlog
    FROM catalog_collections c
    JOIN LATERAL (
      SELECT collection_id, catalog_game_id, rank
      FROM catalog_collection_games
      WHERE collection_id = c.id
      ORDER BY rank ASC
      LIMIT $2
    ) ccg ON TRUE
    JOIN catalog_games cg ON cg.id = ccg.catalog_game_id
    LEFT JOIN external_game_ids e
      ON e.catalog_game_id = cg.id AND e.source = 'rawg'
    WHERE ${where.join(" AND ")}
    ORDER BY c.id ASC, ccg.rank ASC
    `,
    params,
  );

  const byKey = new Map();
  for (const row of rows) {
    const key = row.collection_key;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        title: row.collection_title,
        description: row.collection_description,
        fetchedAt: row.collection_fetched_at,
        expiresAt: row.collection_expires_at,
        results: [],
      });
    }
    const collection = byKey.get(key);
    if (collection.results.length >= resultLimit) continue;
    collection.results.push(
      mapCatalogRow(row, {
        cacheStatus: isFullMetadataFresh(row) ? "fresh" : "stale",
        alreadyInBacklog: row.already_in_backlog,
      }),
    );
  }
  return Array.from(byKey.values()).filter(
    (collection) => collection.results.length,
  );
}

async function upsertCollectionDefinition(
  client,
  collection,
  rawgParams,
  pageSize,
) {
  const { rows } = await client.query(
    `
    INSERT INTO catalog_collections (
      key,
      title,
      description,
      provider,
      source_config_json,
      fetched_at,
      expires_at,
      failed_at,
      failure_reason
    )
    VALUES (
      $1, $2, $3, 'rawg', $4::jsonb, NOW(),
      NOW() + ($5 || ' milliseconds')::interval,
      NULL,
      NULL
    )
    ON CONFLICT (key) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          provider = EXCLUDED.provider,
          source_config_json = EXCLUDED.source_config_json,
          fetched_at = EXCLUDED.fetched_at,
          expires_at = EXCLUDED.expires_at,
          failed_at = NULL,
          failure_reason = NULL,
          updated_at = NOW()
    RETURNING *
    `,
    [
      collection.key,
      collection.title,
      collection.description || "",
      JSON.stringify({
        params: rawgParams,
        pageSize: pageSize || DEFAULT_COLLECTION_LIMIT,
      }),
      COLLECTION_TTL_MS,
    ],
  );
  return rows[0];
}

async function markCollectionFailure(collection, reason) {
  await pool.query(
    `
    INSERT INTO catalog_collections (
      key,
      title,
      description,
      provider,
      source_config_json,
      failed_at,
      failure_reason
    )
    VALUES ($1, $2, $3, 'rawg', $4::jsonb, NOW(), $5)
    ON CONFLICT (key) DO UPDATE
      SET failed_at = NOW(),
          failure_reason = $5,
          updated_at = NOW()
    `,
    [
      collection.key,
      collection.title,
      collection.description || "",
      JSON.stringify(collectionParams(collection)),
      reason,
    ],
  );
}

async function writeSearchCache(queryKey, ids) {
  await pool.query(
    `
    INSERT INTO catalog_search_cache (
      provider,
      query_key,
      result_catalog_game_ids_json,
      fetched_at,
      expires_at,
      failed_at,
      failure_reason
    )
    VALUES ('rawg', $1, $2::jsonb, NOW(), NOW() + ($3 || ' milliseconds')::interval, NULL, NULL)
    ON CONFLICT (provider, query_key) DO UPDATE
      SET result_catalog_game_ids_json = EXCLUDED.result_catalog_game_ids_json,
          fetched_at = EXCLUDED.fetched_at,
          expires_at = EXCLUDED.expires_at,
          failed_at = NULL,
          failure_reason = NULL,
          updated_at = NOW()
    `,
    [queryKey, JSON.stringify(ids), SEARCH_CACHE_TTL_MS],
  );
}

async function markSearchFailure(queryKey, reason) {
  await pool.query(
    `
    INSERT INTO catalog_search_cache (
      provider,
      query_key,
      result_catalog_game_ids_json,
      failed_at,
      failure_reason
    )
    VALUES ('rawg', $1, '[]'::jsonb, NOW(), $2)
    ON CONFLICT (provider, query_key) DO UPDATE
      SET failed_at = NOW(),
          failure_reason = $2,
          updated_at = NOW()
    `,
    [queryKey, reason],
  );
}

export async function searchCatalog(query, user = {}) {
  const queryKey = normalizeQueryKey(query);
  if (queryKey.length < 3) {
    return { results: [], source: "cache", cacheStatus: "unavailable" };
  }

  const cache = await getSearchCache(queryKey);
  const cachedIds = jsonArray(cache?.result_catalog_game_ids_json).map(Number);
  if (cacheFresh(cache) && cachedIds.length) {
    const rows = await catalogRowsForIds(cachedIds, user.id);
    return {
      results: rows.map((row) =>
        mapCatalogRow(row, {
          cacheStatus: "fresh",
          alreadyInBacklog: row.already_in_backlog,
        }),
      ),
      source: "cache",
      cacheStatus: "fresh",
    };
  }

  if (user?.is_guest) {
    const rows = await catalogRowsForIds(cachedIds, user.id);
    return {
      results: rows.map((row) =>
        mapCatalogRow(row, {
          cacheStatus: "stale",
          alreadyInBacklog: row.already_in_backlog,
        }),
      ),
      source: "cache",
      cacheStatus: rows.length ? "stale" : "unavailable",
    };
  }

  try {
    const rawgResults = await searchRawgCoalesced(queryKey);
    const catalogRows = [];
    for (const result of rawgResults || []) {
      const row = await upsertCatalogFromRawgData(
        normalizeRawgSearchResult(result),
      );
      if (row) catalogRows.push(row);
    }
    await writeSearchCache(
      queryKey,
      catalogRows.map((row) => row.id),
    );
    const rows = await catalogRowsForIds(
      catalogRows.map((row) => row.id),
      user.id,
    );
    return {
      results: rows.map((row) =>
        mapCatalogRow(row, {
          cacheStatus: "live",
          alreadyInBacklog: row.already_in_backlog,
        }),
      ),
      source: "rawg",
      cacheStatus: "live",
    };
  } catch (error) {
    await markSearchFailure(queryKey, error?.message || "rawg_search_failed");
    const rows = await catalogRowsForIds(cachedIds, user.id);
    return {
      results: rows.map((row) =>
        mapCatalogRow(row, {
          cacheStatus: "stale",
          alreadyInBacklog: row.already_in_backlog,
        }),
      ),
      source: "cache",
      cacheStatus: rows.length ? "stale" : "unavailable",
    };
  }
}

export async function ensureCatalogGameFromRawg(
  rawgId,
  rawgSlug,
  options = {},
) {
  const id = String(rawgId || "").trim();
  if (!id) return null;

  let row = await selectCatalogByExternal(PROVIDER, id);
  if (
    row &&
    isFullMetadataFresh(row) &&
    !options.force &&
    !options.allowSearchResult
  ) {
    return row;
  }

  if (row && !canRetryFailure(row) && !options.force) return row;

  try {
    const rawg = await fetchRawgDetailCoalesced(rawgId || rawgSlug);
    if (!rawg) {
      if (row) await markCatalogFailure(row.id, "rawg_detail_unavailable");
      return row;
    }
    row = await upsertCatalogFromRawgData(normalizeRawgDetail(rawg));
    return row;
  } catch (error) {
    if (row)
      await markCatalogFailure(row.id, error?.message || "rawg_detail_failed");
    return row;
  }
}

async function rawgExternalForCatalog(catalogGameId) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM external_game_ids
    WHERE catalog_game_id = $1 AND source = 'rawg'
    LIMIT 1
    `,
    [catalogGameId],
  );
  return rows[0] || null;
}

export async function getCatalogGame(catalogGameId, user = {}, options = {}) {
  let row = await selectCatalogById(Number(catalogGameId), user.id);
  if (!row) return null;

  const shouldFetch =
    !user?.is_guest &&
    (options.force ||
      row.metadata_quality !== "full" ||
      !isFullMetadataFresh(row)) &&
    canRetryFailure(row);

  if (shouldFetch) {
    const external = await rawgExternalForCatalog(row.id);
    if (external?.external_id) {
      await ensureCatalogGameFromRawg(external.external_id, external.slug, {
        force: options.force,
        allowSearchResult: true,
      });
      row = await selectCatalogById(Number(catalogGameId), user.id);
    }
  }

  const fresh = isFullMetadataFresh(row);
  return mapCatalogRow(row, {
    cacheStatus: fresh ? "fresh" : "stale",
    alreadyInBacklog: row.already_in_backlog,
  });
}

export async function refreshCatalogGame(catalogGameId, user = {}) {
  const row = await selectCatalogById(Number(catalogGameId), user.id);
  if (!row) return null;
  if (user?.is_guest) {
    return mapCatalogRow(row, {
      cacheStatus: "stale",
      alreadyInBacklog: row.already_in_backlog,
    });
  }

  const fetched = row.metadata_fetched_at
    ? new Date(row.metadata_fetched_at).getTime()
    : 0;
  const hasMetadata = row.metadata_quality === "full";
  const cooldownActive =
    hasMetadata &&
    Number.isFinite(fetched) &&
    Date.now() - fetched < MANUAL_REFRESH_COOLDOWN_MS;
  if (cooldownActive) {
    return mapCatalogRow(row, {
      cacheStatus: "fresh",
      alreadyInBacklog: row.already_in_backlog,
    });
  }

  return getCatalogGame(catalogGameId, user, { force: true });
}

export async function seedCatalogCollection(collection, options = {}) {
  const rawgParams = collectionParams(collection);
  const limit = Math.min(
    Math.max(Number(options.limit) || DEFAULT_COLLECTION_LIMIT, 1),
    40,
  );

  try {
    const rawgResults = await fetchRAWGGames(rawgParams, {
      pageSize: Math.min(limit * DEFAULT_COLLECTION_FETCH_MULTIPLIER, 40),
    });
    const catalogRows = [];
    const seen = new Set();
    const candidates = sortCollectionCandidates(rawgResults || [], collection);
    for (const result of candidates) {
      if (!passesCollectionQuality(result, collection)) continue;
      if (!result?.rawg_id || seen.has(result.rawg_id)) continue;
      seen.add(result.rawg_id);
      const row = await upsertCatalogFromRawgData(
        normalizeRawgSearchResult(result),
      );
      if (row) catalogRows.push(row);
      if (catalogRows.length >= limit) break;
    }

    if (!catalogRows.length) {
      throw new Error("rawg_collection_empty");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const savedCollection = await upsertCollectionDefinition(
        client,
        collection,
        rawgParams,
        limit,
      );
      await client.query(
        "DELETE FROM catalog_collection_games WHERE collection_id = $1",
        [savedCollection.id],
      );
      for (const [index, row] of catalogRows.entries()) {
        await client.query(
          `
          INSERT INTO catalog_collection_games (
            collection_id,
            catalog_game_id,
            rank
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (collection_id, catalog_game_id) DO UPDATE
            SET rank = EXCLUDED.rank,
                added_at = NOW()
          `,
          [savedCollection.id, row.id, index + 1],
        );
      }
      await client.query("COMMIT");
      return {
        key: collection.key,
        title: collection.title,
        count: catalogRows.length,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    await markCollectionFailure(
      collection,
      error?.message || "rawg_collection_failed",
    );
    return {
      key: collection.key,
      title: collection.title,
      count: 0,
      error: error?.message || "rawg_collection_failed",
    };
  }
}

export async function seedCatalogCollections(options = {}) {
  const wanted = new Set(
    String(options.only || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  );
  const collections = wanted.size
    ? CATALOG_COLLECTIONS.filter((collection) => wanted.has(collection.key))
    : CATALOG_COLLECTIONS;

  const results = [];
  for (const collection of collections) {
    results.push(await seedCatalogCollection(collection, options));
  }
  return results;
}

function collectionByKey(key) {
  return (
    CATALOG_COLLECTIONS.find((collection) => collection.key === key) || null
  );
}

async function selectCollectionByKey(key) {
  const { rows } = await pool.query(
    "SELECT * FROM catalog_collections WHERE key = $1 LIMIT 1",
    [key],
  );
  return rows[0] || null;
}

export async function loadMoreCatalogCollection(key, user = {}, options = {}) {
  const collection = collectionByKey(key);
  if (!collection) return null;

  const existing = await selectCollectionByKey(key);
  if (!existing) {
    await seedCatalogCollection(collection, {
      limit: options.limit || DEFAULT_COLLECTION_LIMIT,
    });
    const shelves = await collectionRows(user.id, {
      key,
      limit: options.returnLimit || MAX_COLLECTION_GAMES,
    });
    return shelves[0] || null;
  }

  const countResult = await pool.query(
    `
    SELECT COUNT(*)::int AS count, COALESCE(MAX(rank), 0)::int AS max_rank
    FROM catalog_collection_games
    WHERE collection_id = $1
    `,
    [existing.id],
  );
  const existingCount = countResult.rows[0]?.count || 0;
  const maxRank = countResult.rows[0]?.max_rank || 0;
  if (existingCount >= MAX_COLLECTION_GAMES) {
    const shelves = await collectionRows(user.id, {
      key,
      limit: options.returnLimit || MAX_COLLECTION_GAMES,
    });
    return shelves[0] || null;
  }

  const rawConfig = existing.source_config_json || {};
  const baseParams =
    rawConfig.params || rawConfig || collectionParams(collection);
  const pageSize = Math.min(
    Math.max(
      Number(rawConfig.pageSize || options.limit || DEFAULT_COLLECTION_LIMIT),
      1,
    ),
    40,
  );
  const page = Math.floor(existingCount / pageSize) + 1;
  const rawgResults = await fetchRAWGGames(
    { ...baseParams, page },
    { pageSize: Math.min(pageSize * DEFAULT_COLLECTION_FETCH_MULTIPLIER, 40) },
  );

  const candidates = sortCollectionCandidates(rawgResults || [], collection);
  const externalIds = candidates
    .map((result) => String(result.rawg_id || ""))
    .filter(Boolean);
  const existingExternalIds = new Set();
  if (externalIds.length) {
    const { rows } = await pool.query(
      `
      SELECT e.external_id
      FROM external_game_ids e
      JOIN catalog_collection_games ccg
        ON ccg.catalog_game_id = e.catalog_game_id
      WHERE ccg.collection_id = $1
        AND e.source = 'rawg'
        AND e.external_id = ANY($2::text[])
      `,
      [existing.id, externalIds],
    );
    rows.forEach((row) => existingExternalIds.add(row.external_id));
  }

  const appended = [];
  for (const result of candidates) {
    const externalId = String(result?.rawg_id || "");
    if (!externalId || existingExternalIds.has(externalId)) continue;
    if (!passesCollectionQuality(result, collection)) continue;
    const row = await upsertCatalogFromRawgData(
      normalizeRawgSearchResult(result),
    );
    if (!row) continue;
    appended.push(row);
    existingExternalIds.add(externalId);
    if (existingCount + appended.length >= MAX_COLLECTION_GAMES) break;
    if (appended.length >= pageSize) break;
  }

  if (appended.length) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [index, row] of appended.entries()) {
        await client.query(
          `
          INSERT INTO catalog_collection_games (
            collection_id,
            catalog_game_id,
            rank
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (collection_id, catalog_game_id) DO NOTHING
          `,
          [existing.id, row.id, maxRank + index + 1],
        );
      }
      await client.query(
        "UPDATE catalog_collections SET updated_at = NOW() WHERE id = $1",
        [existing.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const shelves = await collectionRows(user.id, {
    key,
    limit: options.returnLimit || MAX_COLLECTION_GAMES,
  });
  return shelves[0] || null;
}

export async function seedExpiredCatalogCollections(options = {}) {
  const { rows } = await pool.query(
    "SELECT key, expires_at FROM catalog_collections",
  );
  const existing = new Map(rows.map((row) => [row.key, row]));
  const only = CATALOG_COLLECTIONS.filter((collection) => {
    const row = existing.get(collection.key);
    if (!row) return true;
    if (!row.expires_at) return true;
    return new Date(row.expires_at).getTime() <= Date.now();
  })
    .map((collection) => collection.key)
    .join(",");
  if (!only) return [];
  return seedCatalogCollections({ ...options, only });
}

export function startCatalogCollectionScheduler() {
  const enabled =
    String(process.env.CATALOG_AUTO_SEED || "").toLowerCase() === "true";
  if (!enabled || process.env.NODE_ENV === "test") return null;

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const results = await seedExpiredCatalogCollections({
        limit: Number(
          process.env.CATALOG_SEED_LIMIT || DEFAULT_COLLECTION_LIMIT,
        ),
      });
      if (results.length) {
        console.log(
          "Catalog collection seed complete:",
          results.map((result) => `${result.key}:${result.count}`).join(", "),
        );
      }
    } catch (error) {
      console.error("Catalog collection seed failed:", error?.message || error);
    } finally {
      running = false;
    }
  };

  const initialTimeout = setTimeout(run, 60 * 1000);
  const interval = setInterval(run, COLLECTION_SCHEDULER_INTERVAL_MS);
  return () => {
    clearTimeout(initialTimeout);
    clearInterval(interval);
  };
}

export async function recentCatalogGames(user = {}, limit = 12) {
  const { rows } = await pool.query(
    `
    SELECT cg.*,
           e.external_id AS rawg_external_id,
           e.slug AS rawg_external_slug,
           ${steamOwnedSelect(2)},
           EXISTS (
             SELECT 1 FROM games g
             WHERE ${ownedCatalogPredicate("g", 2)}
           ) AS already_in_backlog
    FROM catalog_games cg
    LEFT JOIN external_game_ids e
      ON e.catalog_game_id = cg.id AND e.source = 'rawg'
    ORDER BY cg.updated_at DESC, cg.id DESC
    LIMIT $1
    `,
    [Math.min(Math.max(Number(limit) || 12, 1), 24), user.id || null],
  );
  return rows.map((row) =>
    mapCatalogRow(row, {
      cacheStatus: isFullMetadataFresh(row) ? "fresh" : "stale",
      alreadyInBacklog: row.already_in_backlog,
    }),
  );
}

export async function browseCatalog(options = {}, user = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 24, 1), 48);
  const shelfLimit = Math.min(
    Math.max(Number(options.shelfLimit) || 24, 1),
    24,
  );
  const page = Math.max(Number(options.page) || 1, 1);
  const filters = {
    genre: String(options.genre || "").trim(),
    releaseWindow: ["all", "upcoming", "recent", "older", "unknown"].includes(
      options.releaseWindow,
    )
      ? options.releaseWindow
      : "all",
    backlog: ["all", "in", "not_in"].includes(options.backlog)
      ? options.backlog
      : "all",
    sort: [
      "recent",
      "title",
      "release_desc",
      "release_asc",
      "rating",
      "metacritic",
    ].includes(options.sort)
      ? options.sort
      : "recent",
  };

  const [rows, total, genres, shelves] = await Promise.all([
    browseCatalogRows(filters, user.id, {
      limit,
      offset: (page - 1) * limit,
    }),
    browseCatalogCount(filters, user.id),
    catalogGenreFacets(),
    collectionRows(user.id, { limit: shelfLimit }),
  ]);

  return {
    results: rows.map((row) =>
      mapCatalogRow(row, {
        cacheStatus: isFullMetadataFresh(row) ? "fresh" : "stale",
        alreadyInBacklog: row.already_in_backlog,
      }),
    ),
    shelves,
    facets: { genres },
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    source: "cache",
    cacheStatus: rows.length || shelves.length ? "fresh" : "unavailable",
  };
}

export function decorateGameWithCatalog(game, fallbackRawg = {}) {
  if (!game?.catalog_game_id) return null;
  const genres = jsonArray(game.catalog_genres_json);
  const stores = jsonArray(game.catalog_stores_json);
  const tags = jsonArray(game.catalog_tags_json);
  const dbHours = toHourInt(game.how_long_to_beat);
  const rawgHours = toHourInt(game.catalog_rawg_playtime_hours);
  return {
    how_long_to_beat: dbHours ?? rawgHours ?? null,
    displayHLTB: dbHours ?? rawgHours ?? null,
    displayName: game.catalog_name || game.name,
    cover: game.catalog_cover_url || fallbackRawg?.background_image || null,
    releaseDate: game.catalog_released_at || fallbackRawg?.released || null,
    description:
      game.catalog_description_html ||
      sanitizeGameHtml(fallbackRawg?.description),
    rating:
      game.catalog_rawg_rating == null
        ? null
        : Number(game.catalog_rawg_rating),
    genres: genres.length ? genres.join(", ") : null,
    metacritic: game.catalog_metacritic ?? null,
    stores: stores.length
      ? stores
          .map((store) => store?.name)
          .filter(Boolean)
          .join(", ")
      : null,
    features: tags.length ? tags.join(", ") : null,
  };
}
