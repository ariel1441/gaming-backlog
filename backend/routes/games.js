// backend/routes/games.js
import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { fetchGameData } from "../utils/fetchRAWG.js";
import { upsertGame, reorderGame } from "../validators/games.js";
import fs from "fs/promises";
import path from "path";

import { toHourInt } from "../utils/time.js";
import { loadHLTBLocal, lookupHLTBHoursByPref } from "../utils/hltb.js";
import { normStatus } from "../utils/status.js";
import { cacheClear } from "../utils/microCache.js";
import { sanitizeGameHtml } from "../utils/sanitizeHtml.js";
import { normalizeScore } from "../utils/normalize.js";

const router = express.Router();

const CACHE_PATH = path.resolve("backend/data/cached_rawg_data.json");
const DEFAULT_POSITION_SPACING = 1000;

// retry failed/empty cache entries after this many ms (default 1h)
const RAWG_FAIL_TTL_MS = Number(process.env.RAWG_FAIL_TTL_MS || 60 * 60 * 1000);

// Use DB local day (Israel) — avoids UTC "yesterday" issues.
const TODAY_SQL = "(now() AT TIME ZONE 'Asia/Jerusalem')::date";

/* -------------------------------- RAWG cache -------------------------------- */

const loadCache = async (app) => {
  try {
    const data = await fs.readFile(CACHE_PATH, "utf-8");
    app.locals.rawgCache = JSON.parse(data);
  } catch (e) {
    console.warn(
      "RAWG cache missing or unreadable, starting empty:",
      e?.message || e
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

/* ------------------------------- Position helper ------------------------------ */
/**
 * Allocate the next position at the END of the **rank group** (not single status).
 * This lets any statuses with the same `rank` share one manual ordering space.
 */
const getNextPosition = async (status, userId) => {
  const result = await pool.query(
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

/* -------------- Simple concurrency helper for the first cold rebuild ---------- */
const mapWithLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }
  );
  await Promise.all(workers);
  return out;
};

/* --------------------------- UI-safe game serializer -------------------------- */
/**
 * We return how_long_to_beat as the *display* value:
 *   DB how_long_to_beat  OR  RAWG hours  OR  null
 * We also include displayHLTB and displayName for future UI uses.
 */
const decorateGameForClient = (game, rawg) => {
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
  };
};

/* ----------------------------------- Routes ---------------------------------- */

// GET all games for the authenticated user (fast cold rebuild)
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(
      `
      SELECT g.*, s.rank AS status_rank
      FROM games g
      LEFT JOIN statuses s ON s.status = g.status
      WHERE g.user_id = $1
      ORDER BY s.rank NULLS LAST, g.position NULLS LAST, g.id
      `,
      [userId]
    );

    const cache = req.app.locals.rawgCache || {};

    // Case-insensitive dedupe: keep one original name per lowercased key
    const nameMap = new Map(); // lowerName -> originalName
    for (const r of rows) {
      const orig = String(r.name || "").trim();
      const lower = lowerKey(orig);
      if (!nameMap.has(lower)) nameMap.set(lower, orig);
    }

    let cacheUpdated = false;
    await mapWithLimit([...nameMap.values()], 6, async (name) => {
      const { changed } = await ensureRawgEntry(cache, name, {
        persist: false,
      });
      if (changed) cacheUpdated = true;
    });
    // Persist only if we actually touched the cache (non-fatal)
    if (cacheUpdated) {
      try {
        await saveCache(cache);
      } catch (e) {
        console.warn("saveCache(GET) failed:", e?.message || e);
      }
    }

    // Now decorate from cache (no extra network)
    const out = rows.map((game) => {
      const rawg = cache[lowerKey(game.name)] || {};
      return decorateGameForClient(game, rawg);
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// POST create a new game
router.post("/", verifyToken, upsertGame, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      name,
      status,
      my_genre,
      thoughts,
      my_score,
      how_long_to_beat,
      started_at,
      finished_at,
      hltb_pref, // 'main' | 'plus' | 'comp' (default 'main')
    } = req.body || {};

    const statusNorm = normStatus(status);
    const userTitle = String(name).trim();

    const score = normalizeScore(my_score);

    const cache = req.app.locals.rawgCache || {};
    // persist immediately on single-item routes
    const { rawg, canonicalName } = await ensureRawgEntry(cache, userTitle, {
      persist: true,
    });

    // HLTB write-once logic (user value wins; else user name; else RAWG official name)
    let hours = toHourInt(how_long_to_beat);
    if (hours == null) {
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

    const position = await getNextPosition(statusNorm, userId);

    // Did the client explicitly include these keys?
    const startedProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "started_at"
    );
    const finishedProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "finished_at"
    );
    const startedBody = startedProvided ? req.body.started_at : null;
    const finishedBody = finishedProvided ? req.body.finished_at : null;

    const insertSql = `
      INSERT INTO games
        (user_id, name, status, my_genre, thoughts, my_score,
         how_long_to_beat, position, started_at, finished_at)
      VALUES
        (
          $1, $2, $3, $4, $5, $6,
          $7, $8,
          CASE
            WHEN $9  THEN $10
            WHEN $3 = 'playing' THEN ${TODAY_SQL}
            ELSE NULL
          END,
          CASE
            WHEN $11 THEN $12
            WHEN $3 IN ('finished','played alot but didnt finish') THEN ${TODAY_SQL}
            ELSE NULL
          END
        )
      RETURNING *;
    `;

    const params = [
      userId, // $1
      userTitle, // $2
      statusNorm, // $3
      (my_genre || "").trim(), // $4
      (thoughts || "").trim(), // $5
      score, // $6
      hours, // $7
      position, // $8
      startedProvided, // $9
      startedBody, // $10
      finishedProvided, // $11
      finishedBody, // $12
    ];

    const { rows } = await pool.query(insertSql, params);

    // Invalidate Insights micro-cache for this user (new game affects analytics)
    cacheClear(userId);

    res.status(201).json(decorateGameForClient(rows[0], rawg));
  } catch (err) {
    next(err);
  }
});

// PUT update a game — position is preserved (never recalculated on edit)
router.put("/:id", verifyToken, upsertGame, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const gameId = Number(req.params.id);
    if (!Number.isFinite(gameId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const {
      name,
      status,
      my_genre,
      thoughts,
      my_score,
      how_long_to_beat,
      started_at,
      finished_at,
      hltb_pref,
    } = req.body || {};

    if (!name || !status) {
      return res.status(400).json({ error: "name and status are required" });
    }

    const statusNorm = normStatus(status);
    const userTitle = String(name || "").trim();

    // ensure ownership and get current row
    const existing = await pool.query(
      `SELECT * FROM games WHERE id = $1 AND user_id = $2`,
      [gameId, userId]
    );
    const row = existing.rows[0];
    if (!row) return res.status(404).json({ error: "Not found" });

    // NEVER change position on edit (even if status changes)
    const position = row.position;

    // Respect rule: only store HLTB/user hours. If user didn't provide and name changed, retry HLTB.
    let newHLTB = toHourInt(how_long_to_beat);
    const nameChanged = userTitle !== row.name;

    if (newHLTB == null && nameChanged) {
      const cache = req.app.locals.rawgCache || {};
      const { canonicalName } = await ensureRawgEntry(cache, userTitle, {
        persist: true,
      });

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

    // Date logic: explicit edits win; else one-time auto on qualifying transition
    const statusChanged = row.status !== statusNorm;

    const startedProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "started_at"
    );
    const finishedProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "finished_at"
    );
    const startedBody = startedProvided ? req.body.started_at : null; // 'YYYY-MM-DD' or null
    const finishedBody = finishedProvided ? req.body.finished_at : null;

    const hours_new = newHLTB ?? toHourInt(row.how_long_to_beat);

    const updateSql = `
  UPDATE games g
     SET name = $1,
         status = $2,
         my_genre = $3,
         thoughts = $4,
         my_score = $5,
         how_long_to_beat = $6,
         position = $7,

         started_at = CASE
           WHEN $11 THEN $8
           WHEN $13 AND $2 = 'playing' AND g.started_at IS NULL THEN ${TODAY_SQL}
           ELSE g.started_at
         END,

         finished_at = CASE
           WHEN $12 THEN $9
           WHEN $13 AND $2 IN ('finished','played alot but didnt finish') AND g.finished_at IS NULL THEN ${TODAY_SQL}
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
      position, // $7  <-- preserve existing position always
      startedBody, // $8
      finishedBody, // $9
      gameId, // $10
      startedProvided, // $11
      finishedProvided, // $12
      statusChanged, // $13
      userId, // $14
    ];

    const { rows } = await pool.query(updateSql, params);
    const nextRow = rows[0];

    // Invalidate Insights micro-cache if analytics-relevant fields changed
    const prevHours = Number(row.how_long_to_beat) || 0;
    const nextHours = Number(nextRow.how_long_to_beat) || 0;
    if (
      row.status !== nextRow.status ||
      row.name !== nextRow.name ||
      prevHours !== nextHours
    ) {
      cacheClear(userId);
    }

    // Ensure RAWG for (possibly updated) name, then decorate
    const cache = req.app.locals.rawgCache || {};
    const { rawg } = await ensureRawgEntry(cache, nextRow.name, {
      persist: true,
    });

    res.json(decorateGameForClient(nextRow, rawg));
  } catch (err) {
    next(err);
  }
});

// DELETE a game
router.delete("/:id", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const gameId = Number(req.params.id);

    const result = await pool.query(
      `DELETE FROM games WHERE id = $1 AND user_id = $2 RETURNING *`,
      [gameId, userId]
    );

    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });

    // Invalidate Insights micro-cache for this user (deletion affects analytics)
    cacheClear(userId);

    // Decorate for consistency (harmless even if UI doesn't use it)
    const cache = req.app.locals.rawgCache || {};
    const rawg = cache[lowerKey(result.rows[0].name)] || {};
    res.json(decorateGameForClient(result.rows[0], rawg));
  } catch (err) {
    next(err);
  }
});

// Public list of statuses (ordered) -> return strings to keep UI simple
router.get("/statuses-list", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT status FROM statuses ORDER BY rank, status`
    );
    res.json(rows.map((r) => r.status));
  } catch (err) {
    next(err);
  }
});

// Reorder (position) within a **rank** (transactional, cross-status within same rank)
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
      const targetStatus = normStatus(status);

      if (typeof targetIndex !== "number" || !targetStatus) {
        return res
          .status(400)
          .json({ error: "status and targetIndex required" });
      }
      const idx = Math.trunc(targetIndex);

      await client.query("BEGIN");

      // Verify ownership
      const gameRes = await client.query(
        `
      SELECT g.id, g.status, g.name
      FROM games g
      WHERE g.id = $1 AND g.user_id = $2
      `,
        [gameId, userId]
      );
      const current = gameRes.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Not found" });
      }

      // Resolve ranks for current & target statuses
      const { rows: trgRows } = await client.query(
        `SELECT rank FROM statuses WHERE status = $1`,
        [targetStatus]
      );
      const { rows: curRows } = await client.query(
        `SELECT rank FROM statuses WHERE status = $1`,
        [current.status]
      );
      const targetRank = trgRows[0]?.rank;
      const currentRank = curRows[0]?.rank;

      if (targetRank == null || currentRank == null) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "unknown status/rank" });
      }
      if (targetRank !== currentRank) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Cross-rank reorder not allowed" });
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
        [userId, targetRank]
      );

      const list = peerRes.rows.map((r) => ({
        id: r.id,
        position: r.position ?? 0,
      }));
      const fromIndex = list.findIndex((x) => x.id === gameId);
      if (fromIndex === -1) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Game not in target rank group" });
      }

      // Move within the rank group
      const [moved] = list.splice(fromIndex, 1);
      const clampedIndex = Math.max(0, Math.min(idx, list.length));
      list.splice(clampedIndex, 0, moved);

      // If dropping into a different status (same rank), update it now
      if (current.status !== targetStatus) {
        await client.query(
          `UPDATE games SET status = $3 WHERE id = $1 AND user_id = $2`,
          [gameId, userId, targetStatus]
        );
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
          [ids, positions, userId]
        );
      }

      await client.query("COMMIT");

      // === Authoritative response ===
      // Return the moved game and the full rank order so the client can apply it immediately
      const movedRowRes = await pool.query(
        `SELECT * FROM games WHERE id = $1 AND user_id = $2`,
        [gameId, userId]
      );
      const cache = req.app.locals.rawgCache || {};
      const { rawg } = await ensureRawgEntry(cache, movedRowRes.rows[0].name, {
        persist: true,
      });

      const rankOrderRes = await pool.query(
        `
        SELECT g.id, g.status, g.position
        FROM games g
        JOIN statuses s2 ON s2.status = g.status
        WHERE g.user_id = $1 AND s2.rank = $2
        ORDER BY g.position NULLS LAST, g.id
        `,
        [userId, targetRank]
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
  }
);

/* ---------------------------------- Startup ---------------------------------- */

export const initCache = async (app) => {
  await loadCache(app); // RAWG cache JSON
  await loadHLTBLocal(app); // HLTB local JSON (uses your dataset’s keys)
};

export default router;
