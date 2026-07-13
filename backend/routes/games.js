// backend/routes/games.js
import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { fetchGameData, fetchGameDataByIdOrSlug } from "../utils/fetchRAWG.js";
import {
  favoriteGames,
  gameIdParam,
  upsertGame,
  reorderGame,
} from "../validators/games.js";
import fs from "fs/promises";
import path from "path";

import { toDateOrNull, toHourInt } from "../utils/time.js";
import { loadHLTBLocal, lookupHLTBHoursByPref } from "../utils/hltb.js";
import { normStatus, statusGroupOf } from "../utils/status.js";
import { cacheClear } from "../utils/microCache.js";
import { affectsInsights } from "../utils/insightsInvalidation.js";
import { sanitizeGameHtml } from "../utils/sanitizeHtml.js";
import { normalizeScore } from "../utils/normalize.js";
import { badRequest, notFound, conflict, httpError } from "../utils/httpError.js";
import { findDuplicateGameTitle } from "../utils/gameTitle.js";
import {
  decorateGameWithCatalog,
  ensureCatalogGameFromRawg,
  searchCatalog,
} from "../services/catalogService.js";
import {
  assertSameRank,
  buildReorderedRankList,
  resolveTargetStatus,
} from "../utils/reorder.js";
import {
  deleteOwnedGameQuery,
  listOwnedGamesQuery,
  listOwnedGameTitlesQuery,
  selectOwnedGameDetailsQuery,
  selectOwnedGameQuery,
  updateOwnedGameStatusQuery,
} from "../utils/gameAccess.js";

const router = express.Router();

const CACHE_PATH = path.resolve("backend/data/cached_rawg_data.json");
const DEFAULT_POSITION_SPACING = 1000;

// retry failed/empty cache entries after this many ms (default 1h)
const RAWG_FAIL_TTL_MS = Number(process.env.RAWG_FAIL_TTL_MS || 60 * 60 * 1000);

// Use DB local day (Israel) to avoid UTC "yesterday" issues.
const TODAY_SQL = "(now() AT TIME ZONE 'Asia/Jerusalem')::date";

/* -------------------------------- RAWG cache -------------------------------- */

const loadCache = async (app) => {
  try {
    const data = await fs.readFile(CACHE_PATH, "utf-8");
    app.locals.rawgCache = JSON.parse(data);
  } catch (e) {
    console.warn(
      "RAWG cache missing or unreadable, starting empty:",
      e?.message || e,
    );
    app.locals.rawgCache = {};
  }
};

// compact JSON, written atomically to avoid corruption
const saveCache = async (cache) => {
  const data = JSON.stringify(cache);
  const dir = path.dirname(CACHE_PATH);
  await fs.mkdir(dir, { recursive: true }); // ensure folder exists

  const tmp = path.join(dir, `.rawg-cache.${process.pid}.${Date.now()}.tmp`);

  // Write to temp + fsync to improve durability
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(data, "utf8");
    await fh.sync(); // flush data/metadata to disk
  } finally {
    await fh.close();
  }

  // Atomic swap into place
  await fs.rename(tmp, CACHE_PATH);
};

const lowerKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

const rawgIdentityKey = (rawgId) => {
  const value = String(rawgId || "").trim();
  return value ? `rawg:${value}` : "";
};

/** Read a reasonable RAWG hours value from a few likely places (do NOT store to DB). */
const getRawgHours = (rawg) => {
  const candidates = [
    rawg?.playtime, // common RAWG field (hours)
    rawg?.time_to_beat?.main, // some wrappers
    rawg?.time_to_beat?.main_story, // alt
    rawg?.playtime_hours, // alt
    rawg?.average_playtime, // alt
  ];
  for (const v of candidates) {
    const h = toHourInt(v);
    if (h != null) return h;
  }
  return null;
};

const isEmptyObject = (obj) =>
  obj &&
  typeof obj === "object" &&
  !Array.isArray(obj) &&
  Object.keys(obj).length === 0;

const isStaleMiss = (entry) => {
  if (!entry) return true;
  if (isEmptyObject(entry)) return true; // legacy empty cache entries: refetch
  if (entry.__failedAt && Date.now() - entry.__failedAt > RAWG_FAIL_TTL_MS)
    return true;
  return false;
};

// coalesce concurrent RAWG fetches for the same title (process-local)
const inflightRawg = new Map(); // key: lower(title) -> Promise<void>

/**
 * Ensure a RAWG entry; returns { rawg, canonicalName, changed }.
 * If `persist` is true, writes immediately (for POST/PUT). For GET list use persist:false.
 */
async function ensureRawgEntry(cache, userTitle, { persist = true } = {}) {
  const key = lowerKey(userTitle);
  let entry = cache[key];
  let changed = false;

  if (isStaleMiss(entry)) {
    let p = inflightRawg.get(key);
    if (!p) {
      p = (async () => {
        try {
          const data = await fetchGameData(userTitle);
          cache[key] = data ?? {};
        } catch (e) {
          cache[key] = { __failedAt: Date.now() };
        }
      })().finally(() => inflightRawg.delete(key));
      inflightRawg.set(key, p);
    }
    await p;
    changed = true;

    if (persist) {
      try {
        await saveCache(cache); // POST/PUT etc
      } catch (e) {
        console.warn("saveCache(persist) failed:", e?.message || e);
      }
    }
    entry = cache[key];
  }

  const rawg = entry || {};
  const canonicalName = (rawg?.name || rawg?.slug || userTitle || "")
    .toString()
    .trim();
  return { rawg, canonicalName, changed };
}

async function ensureRawgIdentityEntry(
  cache,
  { rawgId, rawgSlug, fallbackTitle },
  { persist = true } = {},
) {
  const identityKey = rawgIdentityKey(rawgId);
  if (!identityKey) {
    return ensureRawgEntry(cache, fallbackTitle, { persist });
  }

  let entry = cache[identityKey];
  let changed = false;

  if (isStaleMiss(entry)) {
    try {
      const data = await fetchGameDataByIdOrSlug(rawgId || rawgSlug);
      cache[identityKey] = data ?? {};
    } catch (e) {
      cache[identityKey] = { __failedAt: Date.now() };
    }
    changed = true;

    if (persist) {
      try {
        await saveCache(cache);
      } catch (e) {
        console.warn("saveCache(identity) failed:", e?.message || e);
      }
    }
    entry = cache[identityKey];
  }

  const rawg = entry || {};
  const titleKey = lowerKey(fallbackTitle);
  if (titleKey && rawg && !isEmptyObject(rawg) && !cache[titleKey]) {
    cache[titleKey] = rawg;
    changed = true;
    if (persist) {
      try {
        await saveCache(cache);
      } catch (e) {
        console.warn("saveCache(identity alias) failed:", e?.message || e);
      }
    }
  }

  const canonicalName = (rawg?.name || rawg?.slug || fallbackTitle || "")
    .toString()
    .trim();
  return { rawg, canonicalName, changed };
}

async function ensureRawgForGame(cache, game, options) {
  if (game?.rawg_id) {
    return ensureRawgIdentityEntry(
      cache,
      {
        rawgId: game.rawg_id,
        rawgSlug: game.rawg_slug,
        fallbackTitle: game.name,
      },
      options,
    );
  }
  return ensureRawgEntry(cache, game?.name, options);
}

function cachedRawgForGame(cache, game) {
  if (game?.rawg_id) {
    return (
      cache[rawgIdentityKey(game.rawg_id)] || cache[lowerKey(game.name)] || {}
    );
  }
  return cache[lowerKey(game?.name)] || {};
}

/* ------------------------------- Position helper ------------------------------ */
/**
 * Allocate the next position at the END of the **rank group** (not single status).
 * This lets any statuses with the same `rank` share one manual ordering space.
 */
const getNextPosition = async (status, userId, db = pool) => {
  const result = await db.query(
    `
      SELECT COALESCE(MAX(g.position), 0) AS max
      FROM games g
      JOIN statuses s2 ON s2.status = g.status
      WHERE g.user_id = $1
        AND s2.rank = (SELECT rank FROM statuses WHERE status = $2)
    `,
    [userId, status],
  );
  return (result.rows[0].max || 0) + DEFAULT_POSITION_SPACING;
};

async function lockUserRank(db, userId, status) {
  const result = await db.query("SELECT rank FROM statuses WHERE status = $1", [status]);
  const rank = result.rows[0]?.rank;
  if (!Number.isInteger(rank)) {
    throw httpError(422, "status is invalid", "validation_error");
  }
  await db.query("SELECT pg_advisory_xact_lock($1, $2)", [Number(userId), rank]);
  return rank;
}

/* --------------------------- UI-safe game serializer -------------------------- */
/**
 * We return how_long_to_beat as the *display* value:
 *   DB how_long_to_beat  OR  RAWG hours  OR  null
 * We also include displayHLTB and displayName for future UI uses.
 */
const decorateGameForClient = (game, rawg) => {
  const steamPlaytimeMinutes = Number.isFinite(
    Number(game.steam_playtime_minutes),
  )
    ? Math.max(0, Math.trunc(Number(game.steam_playtime_minutes)))
    : null;
  const steamFields = {
    steamOwned: !!game.steam_owned,
    steamAppId: game.steam_app_id || null,
    steamName: game.steam_name || null,
    steamPlaytimeMinutes: steamPlaytimeMinutes,
    steamPlaytimeHours:
      steamPlaytimeMinutes == null
        ? null
        : Math.round((steamPlaytimeMinutes / 60) * 10) / 10,
    steamLastPlayedAt: game.steam_last_played_at || null,
    steamFirstPlayObservedAt: game.steam_first_play_observed_at || null,
    steamFirstPlayObservedPlaytimeMinutes:
      game.steam_first_play_observed_playtime_minutes == null
        ? null
        : Number(game.steam_first_play_observed_playtime_minutes),
    steamLastSyncedAt: game.steam_last_synced_at || null,
    steamAchievements: {
      status: game.steam_achievements_status || "unknown",
      unlocked:
        game.steam_achievements_unlocked == null
          ? null
          : Number(game.steam_achievements_unlocked),
      total:
        game.steam_achievements_total == null
          ? null
          : Number(game.steam_achievements_total),
      percent:
        game.steam_achievements_percent == null
          ? null
          : Number(game.steam_achievements_percent),
      lastSyncedAt: game.steam_achievements_last_synced_at || null,
      errorCode: game.steam_achievements_last_error_code || null,
      errorMessage: game.steam_achievements_last_error_message || null,
    },
  };
  const catalogDecorated = decorateGameWithCatalog(game, rawg);
  if (catalogDecorated) {
    return {
      ...game,
      ...catalogDecorated,
      ...steamFields,
    };
  }

  const dbHours = toHourInt(game.how_long_to_beat);
  const rawgHours = getRawgHours(rawg);

  const genreNames = Array.isArray(rawg?.genres)
    ? rawg.genres.map((g) => g?.name).filter(Boolean)
    : [];
  const storeNames = Array.isArray(rawg?.stores)
    ? rawg.stores.map((s) => s?.store?.name ?? s?.name).filter(Boolean)
    : [];
  const tagNames = Array.isArray(rawg?.tags)
    ? rawg.tags.map((t) => t?.name).filter(Boolean)
    : [];

  const displayHLTB = dbHours ?? rawgHours ?? null;

  return {
    ...game,
    how_long_to_beat: displayHLTB,
    displayHLTB,
    displayName: rawg?.name || game.name,
    cover: rawg?.cover ?? rawg?.background_image ?? null,
    releaseDate: rawg?.released ?? null,
    description: sanitizeGameHtml(rawg?.description),
    rating:
      rawg && typeof rawg.rating === "number" && rawg.rating > 0
        ? rawg.rating
        : null,
    genres: genreNames.length ? genreNames.join(", ") : null,
    metacritic:
      rawg && typeof rawg.metacritic === "number" && rawg.metacritic > 0
        ? rawg.metacritic
        : null,
    stores: storeNames.length ? storeNames.join(", ") : null,
    features: tagNames.length ? tagNames.join(", ") : null,
    ...steamFields,
  };
};

/* ----------------------------------- Routes ---------------------------------- */

// GET all games for the authenticated user. This hot path is intentionally
// database/cache-only: optional RAWG refreshes must never delay core user data.
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { text, values } = listOwnedGamesQuery(userId);
    const { rows } = await pool.query(text, values);

    const cache = req.app.locals.rawgCache || {};

    // Decorate from Postgres catalog fields and any process-local cache hit.
    const out = rows.map((game) => {
      const rawg = cachedRawgForGame(cache, game);
      return decorateGameForClient(game, rawg);
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// Search RAWG so users can choose the exact external game identity before add.
router.get("/search", verifyToken, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 3) {
      return next(badRequest("Search query must be at least 3 characters."));
    }

    if (req.user?.is_guest) {
      res.setHeader("Cache-Control", "no-store");
      return res.json({ results: [] });
    }

    const catalogPayload = await searchCatalog(q, req.user);
    const results = (catalogPayload.results || []).map((game) => ({
      catalog_game_id: game.id,
      rawg_id: game.rawg_id ?? game.rawgId ?? null,
      rawg_slug: game.rawg_slug || game.rawgSlug || game.slug || "",
      name: game.name,
      released: game.released,
      cover: game.cover,
      rating: game.rating,
      metacritic: game.metacritic,
    }));
    res.setHeader("Cache-Control", "no-store");
    res.json({ results, cacheStatus: catalogPayload.cacheStatus });
  } catch (err) {
    next(err);
  }
});

router.put("/favorites", verifyToken, favoriteGames, async (req, res, next) => {
  let client;
  try {
    const userId = req.user.id;
    const favoriteIds = req.body.favoriteIds || [];

    client = await pool.connect();
    await client.query("BEGIN");

    if (favoriteIds.length) {
      const owned = await client.query(
        `
        SELECT id
        FROM games
        WHERE user_id = $1 AND id = ANY($2::int[])
        FOR UPDATE
        `,
        [userId, favoriteIds],
      );
      if (owned.rows.length !== favoriteIds.length) {
        await client.query("ROLLBACK");
        return next(badRequest("Favorite games must belong to your backlog."));
      }
    }

    await client.query(
      "UPDATE games SET favorite_rank = NULL WHERE user_id = $1",
      [userId],
    );

    if (favoriteIds.length) {
      await client.query(
        `
        UPDATE games AS g
           SET favorite_rank = v.rank
          FROM (
            SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS rank
          ) AS v
         WHERE g.id = v.id AND g.user_id = $3
        `,
        [favoriteIds, favoriteIds.map((_, index) => index + 1), userId],
      );
    }

    const { rows } = await client.query(
      `
      SELECT g.*,
             s.rank AS status_rank,
             cg.name AS catalog_name,
             cg.cover_url AS catalog_cover_url,
             cg.released_at AS catalog_released_at,
             cg.description_html AS catalog_description_html,
             cg.rawg_rating AS catalog_rawg_rating,
             cg.metacritic AS catalog_metacritic,
             cg.rawg_playtime_hours AS catalog_rawg_playtime_hours,
             cg.genres_json AS catalog_genres_json,
             cg.stores_json AS catalog_stores_json,
             cg.tags_json AS catalog_tags_json,
             ugs.provider_app_id AS steam_app_id,
             sic.steam_name AS steam_name,
             ugs.playtime_minutes_forever AS steam_playtime_minutes,
             ugs.last_played_at AS steam_last_played_at,
             ugs.first_play_observed_at AS steam_first_play_observed_at,
             ugs.first_play_observed_playtime_minutes AS steam_first_play_observed_playtime_minutes,
             ugs.last_synced_at AS steam_last_synced_at,
             ugs.achievements_unlocked AS steam_achievements_unlocked,
             ugs.achievements_total AS steam_achievements_total,
             ugs.achievements_percent AS steam_achievements_percent,
             ugs.achievements_status AS steam_achievements_status,
             ugs.achievements_last_synced_at AS steam_achievements_last_synced_at,
             ugs.achievements_last_error_code AS steam_achievements_last_error_code,
             ugs.achievements_last_error_message AS steam_achievements_last_error_message,
             (ugs.id IS NOT NULL AND ugs.source_status = 'owned') AS steam_owned
      FROM games g
      LEFT JOIN statuses s ON s.status = g.status
      LEFT JOIN catalog_games cg ON cg.id = g.catalog_game_id
      LEFT JOIN LATERAL (
        SELECT source.*
        FROM user_game_sources source
        WHERE source.game_id = g.id
          AND source.user_id = g.user_id
          AND source.provider = 'steam'
          AND source.source_status = 'owned'
        ORDER BY
          (source.playtime_minutes_forever IS NOT NULL AND source.playtime_minutes_forever > 0) DESC,
          source.last_synced_at DESC NULLS LAST,
          source.id DESC
        LIMIT 1
      ) ugs ON TRUE
      LEFT JOIN steam_import_candidates sic
        ON sic.user_id = g.user_id
       AND sic.steam_app_id = ugs.provider_app_id
      WHERE g.user_id = $1
      ORDER BY s.rank NULLS LAST, g.position NULLS LAST, g.id
      `,
      [userId],
    );

    await client.query("COMMIT");

    const cache = req.app.locals.rawgCache || {};
    const out = rows.map((game) => {
      const rawg = cachedRawgForGame(cache, game);
      return decorateGameForClient(game, rawg);
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(out);
  } catch (err) {
    try {
      await client?.query("ROLLBACK");
    } catch {
      // ignore rollback failures; the original error is more useful
    }
    next(err);
  } finally {
    client?.release();
  }
});

// POST create a new game
router.post("/", verifyToken, upsertGame, async (req, res, next) => {
  let client;
  try {
    const userId = req.user.id;
    const {
      name,
      status,
      my_genre,
      thoughts,
      my_score,
      how_long_to_beat,
      hours_preferred_source = "auto",
      hours_locked = false,
      hltb_pref, // 'main' | 'plus' | 'comp' (default 'main')
      rawg_id,
      rawg_slug,
    } = req.body || {};

    const statusNorm = normStatus(status);
    const userTitle = String(name).trim();

    const statusRow = await pool.query(
      "SELECT 1 FROM statuses WHERE status = $1",
      [statusNorm],
    );
    if (!statusRow.rows[0]) {
      return next(httpError(422, "status is invalid", "validation_error"));
    }

    const duplicateQuery = listOwnedGameTitlesQuery(userId);
    const duplicateRes = await pool.query(
      duplicateQuery.text,
      duplicateQuery.values,
    );
    const duplicate = findDuplicateGameTitle(userTitle, duplicateRes.rows);
    if (duplicate) {
      return next(conflict(`"${duplicate.name}" is already in your backlog.`));
    }

    const score = normalizeScore(my_score);

    const cache = req.app.locals.rawgCache || {};
    const isGuest = !!req.user?.is_guest;

    // For guests: NEVER fetch RAWG; read from cache only.
    // For real users: persist immediately on single-item routes.
    let rawg, canonicalName;
    let catalogGameId = null;
    if (!isGuest) {
      const ensured = rawg_id
        ? await ensureRawgIdentityEntry(
            cache,
            { rawgId: rawg_id, rawgSlug: rawg_slug, fallbackTitle: userTitle },
            { persist: true },
          )
        : await ensureRawgEntry(cache, userTitle, {
            persist: true,
          });
      rawg = ensured.rawg;
      canonicalName = ensured.canonicalName;
      if (rawg_id) {
        const catalogRow = await ensureCatalogGameFromRawg(rawg_id, rawg_slug, {
          allowSearchResult: true,
        });
        catalogGameId = catalogRow?.id ?? null;
      }
    } else {
      const cached = cache[lowerKey(userTitle)] || {};
      rawg = cached;
      canonicalName = (cached?.name || cached?.slug || userTitle)
        .toString()
        .trim();
    }

    // HLTB write-once logic (user value wins; else user name; else RAWG official name)
    const hoursProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "how_long_to_beat",
    );
    let hours = toHourInt(how_long_to_beat);
    if (hours == null && !hoursProvided) {
      const pref = ["main", "plus", "comp"].includes(hltb_pref)
        ? hltb_pref
        : "main";

      // 1) try with user-entered title
      hours = lookupHLTBHoursByPref(req.app, userTitle, pref);

      // 2) fallback to RAWG official name (lookup only; do NOT change DB name)
      if (
        hours == null &&
        canonicalName &&
        canonicalName.toLowerCase() !== userTitle.toLowerCase()
      ) {
        hours = lookupHLTBHoursByPref(req.app, canonicalName, pref);
      }
    }
    // If still null -> leave DB NULL; client will display RAWG hours only.

    // Did the client explicitly include these keys?
    const startedProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "started_at",
    );
    const finishedProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "finished_at",
    );
    const startedBody = startedProvided ? req.body.started_at : null;
    const finishedBody = finishedProvided ? req.body.finished_at : null;

    const insertSql = `
      INSERT INTO games
        (user_id, catalog_game_id, name, status, my_genre, thoughts, my_score,
         how_long_to_beat, hours_preferred_source, hours_locked, position,
         started_at, finished_at, rawg_id, rawg_slug)
      VALUES
        (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          CASE
            WHEN $12 THEN $13
            WHEN $18 THEN ${TODAY_SQL}
            ELSE NULL
          END,
          CASE
            WHEN $14 THEN $15
            WHEN $19 THEN ${TODAY_SQL}
            ELSE NULL
          END,
          $16,
          $17
        )
      RETURNING *;
    `;

    const params = [
      userId, // $1
      catalogGameId, // $2
      userTitle, // $3
      statusNorm, // $4
      (my_genre || "").trim(), // $5
      (thoughts || "").trim(), // $6
      score, // $7
      hours, // $8
      hours_preferred_source || "auto", // $9
      !!hours_locked, // $10
      0, // $11 allocated under the rank lock below
      startedProvided, // $12
      startedBody, // $13
      finishedProvided, // $14
      finishedBody, // $15
      rawg_id || null, // $16
      (rawg_slug || rawg?.slug || "").trim() || null, // $17
      statusGroupOf(statusNorm) === "playing", // $18
      statusGroupOf(statusNorm) === "done", // $19
    ];

    client = await pool.connect();
    await client.query("BEGIN");
    await lockUserRank(client, userId, statusNorm);

    const finalDuplicateQuery = listOwnedGameTitlesQuery(userId);
    const finalDuplicates = await client.query(
      finalDuplicateQuery.text,
      finalDuplicateQuery.values,
    );
    const finalDuplicate = findDuplicateGameTitle(userTitle, finalDuplicates.rows);
    if (finalDuplicate) {
      throw conflict(`"${finalDuplicate.name}" is already in your backlog.`);
    }

    const position = await getNextPosition(statusNorm, userId, client);
    params[10] = position;
    const { rows } = await client.query(insertSql, params);
    await client.query("COMMIT");

    // Invalidate Insights micro-cache for this user (new game affects analytics)
    cacheClear(userId);

    res.status(201).json(decorateGameForClient(rows[0], rawg));
  } catch (err) {
    try {
      await client?.query("ROLLBACK");
    } catch {}
    next(err);
  } finally {
    client?.release();
  }
});

// PUT update a game; position is preserved and never recalculated on edit.
router.put(
  "/:id",
  verifyToken,
  gameIdParam,
  upsertGame,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const gameId = Number(req.params.id);
      const {
        name,
        status,
        my_genre,
        thoughts,
        my_score,
        how_long_to_beat,
        hours_preferred_source = "auto",
        hours_locked = false,
        hltb_pref,
        rawg_id,
        rawg_slug,
      } = req.body || {};

      const statusNorm = normStatus(status);
      const userTitle = String(name || "").trim();

      const statusRow = await pool.query(
        "SELECT 1 FROM statuses WHERE status = $1",
        [statusNorm],
      );
      if (!statusRow.rows[0]) {
        return next(httpError(422, "status is invalid", "validation_error"));
      }

      // ensure ownership and get current row
      const existingQuery = selectOwnedGameQuery(gameId, userId);
      const existing = await pool.query(
        existingQuery.text,
        existingQuery.values,
      );
      const row = existing.rows[0];
      if (!row) return next(notFound("Not found"));

      const duplicateQuery = listOwnedGameTitlesQuery(userId);
      const duplicateRes = await pool.query(
        duplicateQuery.text,
        duplicateQuery.values,
      );
      const duplicate = findDuplicateGameTitle(userTitle, duplicateRes.rows, {
        excludeId: gameId,
      });
      if (duplicate) {
        return next(
          conflict(`"${duplicate.name}" is already in your backlog.`),
        );
      }

      // NEVER change position on edit (even if status changes)
      const position = row.position;

      // Respect rule: only store HLTB/user hours. If user didn't provide and name changed, retry HLTB.
      let newHLTB = toHourInt(how_long_to_beat);
      const hoursProvided = Object.prototype.hasOwnProperty.call(
        req.body,
        "how_long_to_beat",
      );
      const nameChanged = userTitle !== row.name;

      const isGuest = !!req.user?.is_guest;
      let catalogGameId = row.catalog_game_id || null;

      if (newHLTB == null && !hoursProvided && nameChanged) {
        const cache = req.app.locals.rawgCache || {};
        let canonicalName;
        if (!isGuest) {
          const ensured = rawg_id
            ? await ensureRawgIdentityEntry(
                cache,
                {
                  rawgId: rawg_id,
                  rawgSlug: rawg_slug,
                  fallbackTitle: userTitle,
                },
                { persist: true },
              )
            : await ensureRawgEntry(cache, userTitle, {
                persist: true,
              });
          canonicalName = ensured.canonicalName;
        } else {
          const cached = cache[lowerKey(userTitle)] || {};
          canonicalName = (cached?.name || cached?.slug || userTitle)
            .toString()
            .trim();
        }

        const pref = ["main", "plus", "comp"].includes(hltb_pref)
          ? hltb_pref
          : "main";

        // 1) try with new user-entered title
        newHLTB = lookupHLTBHoursByPref(req.app, userTitle, pref);

        // 2) fallback to RAWG official name (for lookup only)
        if (
          newHLTB == null &&
          canonicalName &&
          canonicalName.toLowerCase() !== userTitle.toLowerCase()
        ) {
          newHLTB = lookupHLTBHoursByPref(req.app, canonicalName, pref);
        }
      }

      const score = normalizeScore(my_score);
      const rawgProvided = Object.prototype.hasOwnProperty.call(
        req.body,
        "rawg_id",
      );
      if (!isGuest && rawg_id) {
        const catalogRow = await ensureCatalogGameFromRawg(rawg_id, rawg_slug, {
          allowSearchResult: true,
        });
        catalogGameId = catalogRow?.id ?? catalogGameId;
      } else if (rawgProvided && !rawg_id) {
        catalogGameId = null;
      }

      // Date logic: explicit edits win; else one-time auto on qualifying transition
      const statusChanged = row.status !== statusNorm;

      const startedProvided = Object.prototype.hasOwnProperty.call(
        req.body,
        "started_at",
      );
      const finishedProvided = Object.prototype.hasOwnProperty.call(
        req.body,
        "finished_at",
      );
      const startedBody = startedProvided ? req.body.started_at : null; // 'YYYY-MM-DD' or null
      const finishedBody = finishedProvided ? req.body.finished_at : null;

      const hours_new = hoursProvided
        ? newHLTB
        : newHLTB ?? toHourInt(row.how_long_to_beat);

      const effectiveStarted = startedProvided
        ? startedBody
        : toDateOrNull(row.started_at);
      const effectiveFinished = finishedProvided
        ? finishedBody
        : toDateOrNull(row.finished_at);
      if (
        effectiveStarted &&
        effectiveFinished &&
        effectiveFinished < effectiveStarted
      ) {
        return next(
          httpError(
            422,
            "finished_at cannot be before started_at",
            "validation_error",
          ),
        );
      }

      const updateSql = `
  UPDATE games g
     SET name = $1,
         status = $2,
         my_genre = $3,
         thoughts = $4,
         my_score = $5,
         how_long_to_beat = $6,
         hours_preferred_source = $7,
         hours_locked = $8,
         position = $9,
         rawg_id = $15,
         rawg_slug = $16,
         catalog_game_id = $17,

         started_at = CASE
           WHEN $11 THEN $18
           WHEN $13 AND $20 AND g.started_at IS NULL THEN ${TODAY_SQL}
           ELSE g.started_at
         END,

         finished_at = CASE
           WHEN $12 THEN $19
           WHEN $13 AND $21 AND g.finished_at IS NULL THEN ${TODAY_SQL}
           ELSE g.finished_at
         END

   WHERE g.id = $10 AND g.user_id = $14
   RETURNING *;
`;

      const params = [
        userTitle, // $1
        statusNorm, // $2
        (my_genre || "").trim(), // $3
        (thoughts || "").trim(), // $4
        score, // $5
        hours_new, // $6
        hours_preferred_source || "auto", // $7
        !!hours_locked, // $8
        position, // $9  <-- preserve existing position always
        gameId, // $10
        startedProvided, // $11
        finishedProvided, // $12
        statusChanged, // $13
        userId, // $14
        rawg_id || null, // $15
        (rawg_slug || "").trim() || null, // $16
        catalogGameId, // $17
        startedBody, // $18
        finishedBody, // $19
        statusGroupOf(statusNorm) === "playing", // $20
        statusGroupOf(statusNorm) === "done", // $21
      ];

      const { rows } = await pool.query(updateSql, params);
      const nextRow = rows[0];

      // Invalidate Insights micro-cache if analytics-relevant fields changed
      if (affectsInsights(row, nextRow)) {
        cacheClear(userId);
      }

      // Reload the enriched row so edit responses preserve Steam/source metadata.
      const detailsQuery = selectOwnedGameDetailsQuery(gameId, userId);
      const detailsRes = await pool.query(
        detailsQuery.text,
        detailsQuery.values,
      );
      const responseRow = detailsRes.rows[0] || nextRow;

      // Ensure RAWG for (possibly updated) name, then decorate.
      const cache = req.app.locals.rawgCache || {};
      let rawg;
      if (!isGuest) {
        const ensured = await ensureRawgForGame(cache, responseRow, {
          persist: true,
        });
        rawg = ensured.rawg;
      } else {
        rawg = cachedRawgForGame(cache, responseRow);
      }

      res.json(decorateGameForClient(responseRow, rawg));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE a game
router.delete("/:id", verifyToken, gameIdParam, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const gameId = Number(req.params.id);

    const deleteQuery = deleteOwnedGameQuery(gameId, userId);
    const result = await pool.query(deleteQuery.text, deleteQuery.values);

    if (!result.rows[0]) return next(notFound("Not found"));

    // Invalidate Insights micro-cache for this user (deletion affects analytics)
    cacheClear(userId);

    // Decorate for consistency (harmless even if UI doesn't use it)
    const cache = req.app.locals.rawgCache || {};
    const rawg = cachedRawgForGame(cache, result.rows[0]);
    res.json(decorateGameForClient(result.rows[0], rawg));
  } catch (err) {
    next(err);
  }
});

// Public list of statuses (ordered) -> return strings to keep UI simple
router.get("/statuses-list", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT status FROM statuses ORDER BY rank, status`,
    );
    res.json(rows.map((r) => r.status));
  } catch (err) {
    next(err);
  }
});

// Reorder (position) within a **rank**. Status only changes when the client
// explicitly sends a same-rank target status.
router.patch(
  "/:id/position",
  verifyToken,
  reorderGame,
  async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();

      const userId = req.user.id;
      const gameId = Number(req.params.id);
      const { status, targetIndex } = req.body || {};

      const idx = Math.trunc(targetIndex);

      await client.query("BEGIN");

      // Verify ownership
      const gameQuery = selectOwnedGameQuery(
        gameId,
        userId,
        "id, status, name",
      );
      const gameRes = await client.query(gameQuery.text, gameQuery.values);
      const current = gameRes.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return next(notFound("Not found"));
      }

      const targetStatus = resolveTargetStatus(current.status, status);

      // Resolve ranks for current & target statuses
      const { rows: trgRows } = await client.query(
        `SELECT rank FROM statuses WHERE status = $1`,
        [targetStatus],
      );
      const { rows: curRows } = await client.query(
        `SELECT rank FROM statuses WHERE status = $1`,
        [current.status],
      );
      const targetRank = trgRows[0]?.rank;
      const currentRank = curRows[0]?.rank;

      if (!Number.isInteger(targetRank)) {
        await client.query("ROLLBACK");
        return next(httpError(422, "status is invalid", "validation_error"));
      }

      try {
        assertSameRank(currentRank, targetRank);
      } catch (err) {
        await client.query("ROLLBACK");
        return next(err);
      }

      // Lock peers across ALL statuses in the same rank group
      const peerRes = await client.query(
        `
      SELECT g.id, g.position
      FROM games g
      JOIN statuses s2 ON s2.status = g.status
      WHERE g.user_id = $1 AND s2.rank = $2
      ORDER BY g.position NULLS LAST, g.id
      FOR UPDATE OF g
      `,
        [userId, targetRank],
      );

      let list;
      try {
        list = buildReorderedRankList(peerRes.rows, gameId, idx);
      } catch (err) {
        await client.query("ROLLBACK");
        return next(err);
      }

      // If dropping into a different status (same rank), update it now
      if (current.status !== targetStatus) {
        const statusQuery = updateOwnedGameStatusQuery(
          gameId,
          userId,
          targetStatus,
        );
        await client.query(statusQuery.text, statusQuery.values);
      }

      // Renumber all rows in the rank group with your spacing (UNNEST = scalable)
      if (list.length > 0) {
        const ids = list.map((r) => r.id);
        const positions = list.map((_, i) => i * DEFAULT_POSITION_SPACING);
        await client.query(
          `
            UPDATE games AS g
            SET position = v.pos
            FROM (
              SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS pos
            ) AS v
            WHERE g.user_id = $3 AND g.id = v.id
          `,
          [ids, positions, userId],
        );
      }

      await client.query("COMMIT");

      // === Authoritative response ===
      // Return the moved game and the full rank order so the client can apply it immediately
      const movedQuery = selectOwnedGameDetailsQuery(gameId, userId);
      const movedRowRes = await pool.query(movedQuery.text, movedQuery.values);
      const cache = req.app.locals.rawgCache || {};
      const isGuest = !!req.user?.is_guest;
      let rawg;
      if (!isGuest) {
        const ensured = await ensureRawgForGame(cache, movedRowRes.rows[0], {
          persist: true,
        });
        rawg = ensured.rawg;
      } else {
        rawg = cachedRawgForGame(cache, movedRowRes.rows[0]);
      }

      const rankOrderRes = await pool.query(
        `
        SELECT g.id, g.status, g.position
        FROM games g
        JOIN statuses s2 ON s2.status = g.status
        WHERE g.user_id = $1 AND s2.rank = $2
        ORDER BY g.position NULLS LAST, g.id
        `,
        [userId, targetRank],
      );

      res.setHeader("Cache-Control", "no-store");
      res.json({
        game: decorateGameForClient(movedRowRes.rows[0], rawg),
        rank: targetRank,
        rank_order: rankOrderRes.rows, // [{id, status, position}, ...]
      });
    } catch (err) {
      try {
        await client?.query("ROLLBACK");
      } catch {}
      next(err);
    } finally {
      client?.release();
    }
  },
);

/* ---------------------------------- Startup ---------------------------------- */

export const initCache = async (app) => {
  await loadCache(app); // RAWG cache JSON
  await loadHLTBLocal(app); // HLTB local JSON (uses your dataset keys)
};

export default router;
