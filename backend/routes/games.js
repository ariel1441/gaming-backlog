// backend/routes/games.js
import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { fetchGameData } from "../utils/fetchRAWG.js";
import { upsertGame, reorderGame } from "../validators/games.js";
import DOMPurify from "isomorphic-dompurify";
import fs from "fs/promises";
import path from "path";

import { todayUTC, toDateOrNull, toHourInt } from "../utils/time.js";
import { loadHLTBLocal, lookupHLTBHoursByPref } from "../utils/hltb.js";
import { normStatus, DONE_FINISH_SET } from "../utils/status.js";

const router = express.Router();

const CACHE_PATH = path.resolve("backend/data/cached_rawg_data.json");
const DEFAULT_POSITION_SPACING = 1000;

// retry failed/empty cache entries after this many ms (default 1h)
const RAWG_FAIL_TTL_MS = Number(process.env.RAWG_FAIL_TTL_MS || 60 * 60 * 1000);

const DEBUG =
  process.env.DEBUG === "1" || process.env.NODE_ENV === "development";

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

// NEW: coalesce concurrent RAWG fetches for the same title (process-local)
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
const ensureRawgEntry = async (cache, userTitle, { persist = true } = {}) => {
  const key = lowerKey(userTitle);
  let entry = cache[key];

  if (isStaleMiss(entry)) {
    // If someone is already fetching this key, await that work
    let p = inflightRawg.get(key);
    if (!p) {
      // Create one authoritative in-flight fetch (no disk write here)
      p = (async () => {
        try {
          const data = await fetchGameData(userTitle); // query with original title
          cache[key] = data ?? {};
        } catch (e) {
          if (DEBUG) console.warn("[RAWG] fetch error:", e.message);
          cache[key] = { __failedAt: Date.now() };
        }
      })().finally(() => inflightRawg.delete(key));
      inflightRawg.set(key, p);
    }
    await p; // wait for the single shared fetch to complete

    // Persist if this caller requested it (e.g., POST/PUT); GET-list will persist once later
    if (persist) await saveCache(cache);
    entry = cache[key];
  }

  const rawg = entry || {};
  const canonicalName = (rawg?.name || rawg?.slug || userTitle || "")
    .toString()
    .trim();
  return { rawg, canonicalName };
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
    // FIX: Sanitize HTML description to prevent XSS
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

    // Fetch missing entries in parallel with a safe cap and don't save yet
    await mapWithLimit([...nameMap.values()], 6, async (name) => {
      await ensureRawgEntry(cache, name, { persist: false });
    });

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

    const startedAt =
      toDateOrNull(started_at) ??
      (statusNorm === "playing" ? todayUTC() : null);

    const finishedAt =
      toDateOrNull(finished_at) ??
      (DONE_FINISH_SET.has(statusNorm) ? todayUTC() : null);

    const result = await pool.query(
      `
      INSERT INTO games
        (user_id, name, status, my_genre, thoughts, my_score, how_long_to_beat, position, started_at, finished_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
      `,
      [
        userId,
        userTitle, // keep exactly what the user typed
        statusNorm,
        (my_genre || "").trim(),
        (thoughts || "").trim(),
        toHourInt(my_score),
        hours, // only user/HLTB hours; never RAWG
        position,
        startedAt,
        finishedAt,
      ]
    );

    res.status(201).json(decorateGameForClient(result.rows[0], rawg));
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

    // Auto timestamping (client override wins)
    const startedAt =
      toDateOrNull(started_at) ??
      (row.status !== statusNorm && statusNorm === "playing"
        ? todayUTC()
        : row.started_at);

    const finishedAt =
      toDateOrNull(finished_at) ??
      (row.status !== statusNorm && DONE_FINISH_SET.has(statusNorm)
        ? todayUTC()
        : row.finished_at);

    // Respect rule: only store HLTB/user hours. If user didn't provide and name changed, retry HLTB.
    let newHLTB = toHourInt(how_long_to_beat);
    const nameChanged = String(name || "").trim() !== row.name;

    if (newHLTB == null && nameChanged) {
      const cache = req.app.locals.rawgCache || {};
      const { canonicalName } = await ensureRawgEntry(cache, name, {
        persist: true,
      });

      const pref = ["main", "plus", "comp"].includes(hltb_pref)
        ? hltb_pref
        : "main";

      // 1) try with new user-entered title
      newHLTB = lookupHLTBHoursByPref(req.app, name, pref);

      // 2) fallback to RAWG official name (for lookup only)
      if (
        newHLTB == null &&
        canonicalName &&
        canonicalName.toLowerCase() !== String(name).toLowerCase()
      ) {
        newHLTB = lookupHLTBHoursByPref(req.app, canonicalName, pref);
      }
    }

    const result = await pool.query(
      `
      UPDATE games
      SET name = $1,
          status = $2,
          my_genre = $3,
          thoughts = $4,
          my_score = $5,
          how_long_to_beat = $6,
          position = $7,
          started_at = $8,
          finished_at = $9
      WHERE id = $10 AND user_id = $11
      RETURNING *
      `,
      [
        String(name || "").trim(),
        statusNorm,
        (my_genre || "").trim(),
        (thoughts || "").trim(),
        toHourInt(my_score),
        newHLTB ?? toHourInt(row.how_long_to_beat), // keep existing DB value if still null
        position,
        startedAt,
        finishedAt,
        gameId,
        userId,
      ]
    );

    // Ensure RAWG for (possibly updated) name, then decorate
    const cache = req.app.locals.rawgCache || {};
    const { rawg } = await ensureRawgEntry(cache, result.rows[0].name, {
      persist: true,
    });

    res.json(decorateGameForClient(result.rows[0], rawg));
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
