// backend/routes/games.js
import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { fetchGameData } from "../utils/fetchRAWG.js";
import { upsertGame, reorderGame } from "../validators/games.js";
import DOMPurify from "isomorphic-dompurify";
import fs from "fs/promises";
import path from "path";

import { toHourInt } from "../utils/time.js";
import { loadHLTBLocal, lookupHLTBHoursByPref } from "../utils/hltb.js";
import { normStatus, DONE_FINISH_SET } from "../utils/status.js";
import { cacheClear } from "../utils/microCache.js";

const router = express.Router();

const CACHE_PATH = path.resolve("backend/data/cached_rawg_data.json");
const DEFAULT_POSITION_SPACING = 1000;

// retry failed/empty cache entries after this many ms (default 1h)
const RAWG_FAIL_TTL_MS = Number(process.env.RAWG_FAIL_TTL_MS || 60 * 60 * 1000);

const DEBUG =
  process.env.DEBUG === "1" || process.env.NODE_ENV === "development";

// Use DB local day (Israel) — avoids UTC "yesterday" issues.
const TODAY_SQL = "(now() AT TIME ZONE 'Asia/Jerusalem')::date";

/* -------------------------------- RAWG cache -------------------------------- */

const loadCache = async (app) => {
  try {
    const data = await fs.readFile(CACHE_PATH, "utf-8");
    app.locals.rawgCache = JSON.parse(data);
    if (DEBUG) console.log("[RAWG] cache loaded");
  } catch {
    app.locals.rawgCache = {};
    if (DEBUG) console.log("[RAWG] new empty cache");
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

  if (DEBUG) console.log("[RAWG] cache saved");
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
 * Ensure a RAWG entry in cache for a *user-entered* title (single cache key).
 * Never re-key by canonical/official name — avoids duplicate cache entries.
 * - Uses original userTitle for the API query (better relevance)
 * - Uses lowercased/trimmed key for cache identity
 * - On failure, stores { __failedAt } to allow TTL-based retries
 * `persist=false` lets us batch many fetches and write once at the end.
 * Dedup: multiple callers for the same key share one outbound fetch.
 */
// coalesce concurrent RAWG fetches for the same title

const ensureRawgEntry = async (cache, userTitle, { persist = true } = {}) => {
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
          if (DEBUG) console.warn("[RAWG] fetch error:", e.message);
          // mark a timed miss to allow retry later
          cache[key] = { __failedAt: Date.now() };
        }
      })().finally(() => inflightRawg.delete(key));
      inflightRawg.set(key, p);
    }
    await p;
    changed = true;

    // Immediate write for single-item callers (e.g. POST/PUT)
    if (persist) await saveCache(cache);

    entry = cache[key];
  }

  const rawg = entry || {};
  const canonicalName = (rawg?.name || rawg?.slug || userTitle || "")
    .toString()
    .trim();
  return { rawg, canonicalName, changed };
};

/* ------------------------------- Position helper ------------------------------ */

const getNextPosition = async (status, userId) => {
  const result = await pool.query(
    `
      SELECT COALESCE(MAX(position), 0) AS max
      FROM games
      WHERE user_id = $1 AND status = $2
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
 * Important: we return how_long_to_beat as the *display* value:
 *   DB how_long_to_beat  OR  RAWG hours  OR  null
 * This preserves your existing frontend behavior while still never storing RAWG hours.
 * We also include displayHLTB and displayName for future UI migration (optional).
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
    // Back-compat for UI:
    how_long_to_beat: displayHLTB,
    // Nice-to-have for future UI:
    displayHLTB,
    displayName: rawg?.name || game.name,
    // RAWG fields normalized to primitives:
    cover: rawg?.cover ?? rawg?.background_image ?? null,
    releaseDate: rawg?.released ?? null,
    // Sanitize HTML description to prevent XSS
    description: rawg?.description
      ? DOMPurify.sanitize(rawg.description, {
          ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li"],
          ALLOWED_ATTR: [],
        })
      : null,
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

    let dirty = false;
    await mapWithLimit([...nameMap.values()], 6, async (name) => {
      const { changed } = await ensureRawgEntry(cache, name, {
        persist: false,
      });
      if (changed) dirty = true;
    });
    // Persist only if we actually touched the cache
    if (dirty) await saveCache(cache);

    // One write after the batch (huge win vs N writes)
    await saveCache(cache);

    // Now decorate from cache (no extra network)
    const out = rows.map((game) => {
      const rawg = cache[lowerKey(game.name)] || {};
      return decorateGameForClient(game, rawg);
    });

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

    // Optional score; stores null when omitted/empty
    const score = toHourInt(my_score);

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

      // 2) fallback to RAWG official name (for lookup only; do NOT change DB name)
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
      score, // $6 (optional -> null when absent)
      hours, // $7 (only user/HLTB hours; never RAWG)
      position, // $8
      startedProvided, // $9 (bool)
      startedBody, // $10 (date or null)
      finishedProvided, // $11 (bool)
      finishedBody, // $12 (date or null)
    ];

    const { rows } = await pool.query(insertSql, params);

    // Invalidate Insights micro-cache for this user (new game affects analytics)
    cacheClear(userId);

    res.status(201).json(decorateGameForClient(rows[0], rawg));
  } catch (err) {
    next(err);
  }
});

// PUT update a game
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

    // If status changed, allocate a new position in the new status
    let position = row.position;
    if (row.status !== statusNorm) {
      position = await getNextPosition(statusNorm, userId);
    }

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

    const score = toHourInt(my_score);

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
      position, // $7
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

// Reorder (position) within a rank (transactional)
router.patch(
  "/:id/position",
  verifyToken,
  reorderGame,
  async (req, res, next) => {
    let client; // SAFE: allow finally to release even if connect fails
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
      // clamp to a safe integer once; we’ll bound to list length later
      const idx = Math.trunc(targetIndex);

      await client.query("BEGIN");

      // Verify ownership (no lock needed here)
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

      // Lock peers within the SAME status (index: user_id, status, position)
      const peerRes = await client.query(
        `
      SELECT g.id, g.position
      FROM games g
      WHERE g.user_id = $1 AND g.status = $2
      ORDER BY g.position NULLS LAST, g.id
      FOR UPDATE OF g
      `,
        [userId, targetStatus]
      );

      const list = peerRes.rows.map((r) => ({
        id: r.id,
        position: r.position ?? 0,
      }));
      const fromIndex = list.findIndex((x) => x.id === gameId);
      if (fromIndex === -1) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ error: "Game not found in target status" });
      }

      // Move within list (unchanged logic)
      const [moved] = list.splice(fromIndex, 1);
      const clampedIndex = Math.max(0, Math.min(idx, list.length));
      list.splice(clampedIndex, 0, moved);

      // Renumber all rows with your spacing (unchanged logic, one UPDATE round-trip)
      if (list.length > 0) {
        const updateCases = list
          .map(
            (row, i) => `WHEN ${row.id} THEN ${i * DEFAULT_POSITION_SPACING}`
          )
          .join(" ");

        await client.query(
          `
        UPDATE games
        SET position = CASE id ${updateCases} END
        WHERE id = ANY($1) AND user_id = $2
        `,
          [list.map((u) => u.id), userId]
        );
      }

      await client.query("COMMIT");

      // Return decorated row
      const finalRes = await client.query(
        `SELECT * FROM games WHERE id = $1 AND user_id = $2`,
        [gameId, userId]
      );
      const cache = req.app.locals.rawgCache || {};
      const { rawg } = await ensureRawgEntry(cache, finalRes.rows[0].name, {
        persist: true,
      });
      res.json(decorateGameForClient(finalRes.rows[0], rawg));
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
