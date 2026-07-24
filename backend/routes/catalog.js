import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import {
  addCatalogGameToBacklog,
  browseCatalog as validateBrowseCatalog,
  catalogIdParam,
  collectionKeyParam,
  searchCatalog as validateSearchCatalog,
} from "../validators/catalog.js";
import {
  browseCatalog,
  getCatalogGame,
  loadMoreCatalogCollection,
  recentCatalogGames,
  refreshCatalogGame,
  searchCatalog,
  decorateGameWithCatalog,
} from "../services/catalogService.js";
import { badRequest, conflict, notFound, httpError } from "../utils/httpError.js";
import { normStatus, statusGroupOf } from "../utils/status.js";
import { normalizeScore } from "../utils/normalize.js";
import { toHourInt } from "../utils/time.js";
import { loadHLTBLocal, lookupHLTBHoursByPref } from "../utils/hltb.js";
import { cacheClear } from "../utils/microCache.js";
import { ingestRawgGameMetadata } from "../services/metadataIngestionService.js";

const router = express.Router();
const DEFAULT_POSITION_SPACING = 1000;
const TODAY_SQL = "(now() AT TIME ZONE 'Asia/Jerusalem')::date";

const getNextPosition = async (status, userId, db = pool) => {
  const result = await db.query(
    `
      SELECT COALESCE(MAX(g.position), 0) AS max
      FROM games g
      JOIN statuses s2 ON s2.status = g.status
      WHERE g.user_id = $1
        AND s2.rank = (SELECT rank FROM statuses WHERE status = $2)
    `,
    [userId, status]
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
}

async function selectGameWithCatalog(gameId, userId) {
  const { rows } = await pool.query(
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
           cg.metadata_quality AS catalog_metadata_quality,
           ugs.provider_app_id AS steam_app_id,
           ugs.playtime_minutes_forever AS steam_playtime_minutes,
           ugs.last_synced_at AS steam_last_synced_at,
           (ugs.id IS NOT NULL AND ugs.source_status = 'owned') AS steam_owned,
           e.external_id::int AS catalog_rawg_id,
           e.slug AS catalog_rawg_slug
    FROM games g
    LEFT JOIN statuses s ON g.status = s.status
    LEFT JOIN catalog_games cg ON cg.id = g.catalog_game_id
    LEFT JOIN external_game_ids e
      ON e.catalog_game_id = cg.id AND e.source = 'rawg'
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
    WHERE g.id = $1 AND g.user_id = $2
    `,
    [gameId, userId]
  );
  return rows[0] || null;
}

function serializeGame(game) {
  const catalog = decorateGameWithCatalog(game);
  return {
    ...game,
    rawg_id: game.rawg_id ?? game.catalog_rawg_id ?? null,
    rawg_slug: game.rawg_slug ?? game.catalog_rawg_slug ?? null,
    ...(catalog || {}),
  };
}

router.get("/recent", verifyToken, async (req, res, next) => {
  try {
    const results = await recentCatalogGames(req.user, 12);
    res.setHeader("Cache-Control", "no-store");
    res.json({ results, source: "cache", cacheStatus: "fresh" });
  } catch (err) {
    next(err);
  }
});

router.get("/browse", verifyToken, validateBrowseCatalog, async (req, res, next) => {
  try {
    const payload = await browseCatalog(req.query, req.user);
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get("/search", verifyToken, validateSearchCatalog, async (req, res, next) => {
  try {
    const payload = await searchCatalog(req.query.q, req.user);
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/collections/:key/load-more",
  verifyToken,
  collectionKeyParam,
  async (req, res, next) => {
    try {
      if (req.user?.is_guest) {
        return next(badRequest("Live catalog loading is unavailable for guests."));
      }
      const shelf = await loadMoreCatalogCollection(req.params.key, req.user, {
        returnLimit: 96,
      });
      if (!shelf) return next(notFound("Catalog collection not found"));
      res.setHeader("Cache-Control", "no-store");
      res.json({ shelf, source: "rawg", cacheStatus: "live" });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/:id", verifyToken, catalogIdParam, async (req, res, next) => {
  try {
    const game = await getCatalogGame(Number(req.params.id), req.user, {
      ingestRawgGameMetadata:
        req.app.locals.ingestRawgGameMetadata || ingestRawgGameMetadata,
    });
    if (!game) return next(notFound("Catalog game not found"));
    res.setHeader("Cache-Control", "no-store");
    res.json(game);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/refresh", verifyToken, catalogIdParam, async (req, res, next) => {
  try {
    const game = await refreshCatalogGame(Number(req.params.id), req.user, {
      ingestRawgGameMetadata:
        req.app.locals.ingestRawgGameMetadata || ingestRawgGameMetadata,
    });
    if (!game) return next(notFound("Catalog game not found"));
    res.setHeader("Cache-Control", "no-store");
    res.json(game);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:id/add-to-backlog",
  verifyToken,
  addCatalogGameToBacklog,
  async (req, res, next) => {
    let client;
    try {
      const userId = req.user.id;
      const catalogGameId = Number(req.params.id);
      const external = await pool.query(
        `
        SELECT external_id::int AS rawg_id, slug AS rawg_slug
        FROM external_game_ids
        WHERE catalog_game_id = $1 AND source = 'rawg'
        LIMIT 1
        `,
        [catalogGameId],
      );
      const rawg = external.rows[0] || {};
      if (!req.user?.is_guest && rawg.rawg_id) {
        const ingestMetadata =
          req.app.locals.ingestRawgGameMetadata || ingestRawgGameMetadata;
        const ingested = await ingestMetadata(rawg.rawg_id);
        if (Number(ingested.catalogGame.id) !== catalogGameId) {
          throw conflict("Catalog identity no longer matches this RAWG game.");
        }
      }

      const catalog = await getCatalogGame(catalogGameId, req.user, {
        fetchMetadata: false,
      });
      if (!catalog) return next(notFound("Catalog game not found"));

      const {
        status,
        my_genre,
        thoughts,
        my_score,
        how_long_to_beat,
        hltb_pref,
      } = req.body || {};
      const statusNorm = normStatus(status);
      if (!statusNorm) return next(badRequest("status is required"));

      const score = normalizeScore(my_score);
      const hoursProvided = Object.prototype.hasOwnProperty.call(
        req.body,
        "how_long_to_beat",
      );
      let hours = toHourInt(how_long_to_beat);
      if (hours == null && !hoursProvided) {
        const pref = ["main", "plus", "comp"].includes(hltb_pref)
          ? hltb_pref
          : "main";
        hours =
          lookupHLTBHoursByPref(req.app, catalog.name, pref) ??
          toHourInt(catalog.rawgPlaytimeHours);
      }

      const startedProvided = Object.prototype.hasOwnProperty.call(
        req.body,
        "started_at"
      );
      const finishedProvided = Object.prototype.hasOwnProperty.call(
        req.body,
        "finished_at"
      );
      client = await pool.connect();
      await client.query("BEGIN");
      await lockUserRank(client, userId, statusNorm);
      const position = await getNextPosition(statusNorm, userId, client);

      const duplicate = await client.query(
        `
        SELECT id
        FROM games
        WHERE user_id = $1
          AND (
            catalog_game_id = $2 OR
            ($3::int IS NOT NULL AND rawg_id = $3::int) OR
            (
              rawg_id IS NULL AND
              catalog_game_id IS NULL AND
              trim(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            ' ' || trim(regexp_replace(translate(lower(name), '''' || chr(8217) || chr(8216) || chr(700), ''), '[^a-z0-9]+', ' ', 'g')) || ' ',
                            ' vii ',
                            ' 7 '
                          ),
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
              ) =
              trim(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            ' ' || trim(regexp_replace(translate(lower($4), '''' || chr(8217) || chr(8216) || chr(700), ''), '[^a-z0-9]+', ' ', 'g')) || ' ',
                            ' vii ',
                            ' 7 '
                          ),
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
            )
          )
        LIMIT 1
        `,
        [userId, catalogGameId, rawg.rawg_id || null, catalog.name]
      );
      if (duplicate.rows.length) {
        throw conflict("This game is already in your backlog.");
      }

      const { rows } = await client.query(
        `
        INSERT INTO games (
          user_id,
          catalog_game_id,
          name,
          status,
          my_genre,
          thoughts,
          my_score,
          how_long_to_beat,
          position,
          started_at,
          finished_at,
          rawg_id,
          rawg_slug
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          CASE
            WHEN $10 THEN $11
            WHEN $16 THEN ${TODAY_SQL}
            ELSE NULL
          END,
          CASE
            WHEN $12 THEN $13
            WHEN $17 THEN ${TODAY_SQL}
            ELSE NULL
          END,
          $14,
          $15
        )
        RETURNING id
        `,
        [
          userId,
          catalogGameId,
          catalog.name,
          statusNorm,
          (my_genre || "").trim(),
          (thoughts || "").trim(),
          score,
          hours,
          position,
          startedProvided,
          startedProvided ? req.body.started_at : null,
          finishedProvided,
          finishedProvided ? req.body.finished_at : null,
          rawg.rawg_id || null,
          rawg.rawg_slug || null,
          statusGroupOf(statusNorm) === "playing",
          statusNorm === "finished",
        ]
      );

      await client.query("COMMIT");

      cacheClear(userId);
      const game = await selectGameWithCatalog(rows[0].id, userId);
      res.status(201).json(serializeGame(game));
    } catch (err) {
      try {
        await client?.query("ROLLBACK");
      } catch {}
      next(err);
    } finally {
      client?.release();
    }
  }
);

export const initCatalogLookups = async (app) => {
  await loadHLTBLocal(app);
};

export default router;
