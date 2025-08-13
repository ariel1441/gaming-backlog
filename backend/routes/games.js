// backend/routes/games.js
import express from "express";
import { pool } from "../db.js";
import { fetchGameData } from "../utils/fetchRAWG.js";
import { verifyToken } from "../middleware/auth.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const CACHE_PATH = path.resolve("backend/data/cached_rawg_data.json");
const DEFAULT_POSITION_SPACING = 1000;

// Single debug toggle (quiet in production)
const DEBUG =
  process.env.DEBUG === "1" || process.env.NODE_ENV === "development";

/* -------------------- Status / timestamp helpers -------------------- */

const normStatus = (s) => (s || "").toLowerCase().trim();

// Which statuses should auto-set finished_at (do NOT include “played and wont come back”)
const DONE_FINISH_SET = new Set([
  "finished",
  "played alot but didnt finish",
  "played a lot but didn't finish", // variant
]);

// UTC "today" (YYYY-MM-DD) for DATE columns
const todayUTC = () => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Accept "YYYY-MM-DD" or any Date-like; coerce to YYYY-MM-DD or null
const toDateOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Coerce any input to whole hours (int) or null for DB writes
const toHourInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/* -------------------- RAWG cache helpers -------------------- */

const loadCache = async (app) => {
  try {
    const data = await fs.readFile(CACHE_PATH, "utf-8");
    app.locals.rawgCache = JSON.parse(data);
    if (DEBUG) console.log("[RAWG] cache loaded");
  } catch {
    app.locals.rawgCache = {};
    if (DEBUG) console.log("[RAWG] no cache, starting fresh");
  }
};

const saveCache = async (cache) => {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
    if (DEBUG) console.log("[RAWG] cache saved");
  } catch (err) {
    console.error("[RAWG] failed to save cache:", err);
  }
};

/* -------------------- Position helper -------------------- */

const getNextPosition = async (status, userId) => {
  const result = await pool.query(
    "SELECT MAX(position) AS max FROM games WHERE status = $1 AND user_id = $2",
    [status, userId]
  );
  return (result.rows[0].max || 0) + DEFAULT_POSITION_SPACING;
};

/* -------------------- HLTB local lookup (JSON file) -------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HLTB_ENV_PATH =
  process.env.HLTB_DATA_PATH && String(process.env.HLTB_DATA_PATH).trim();

// Roman numerals → digits (VII → 7, etc.)
const romanTokenToInt = (tok) => {
  const map = {
    i: 1,
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
    vii: 7,
    viii: 8,
    ix: 9,
    x: 10,
  };
  const n = map[String(tok || "").toLowerCase()];
  return n ? String(n) : tok;
};

// Normalize titles (punctuation-insensitive; handles roman numerals)
const normalizeTitle = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[\u2012\u2013\u2014\u2015\-:]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(romanTokenToInt)
    .join(" ");

// Seconds → whole hours (int); treat 0/invalid as null
const secToHourInt = (sec) => {
  const n = Number(sec);
  return Number.isFinite(n) && n > 0 ? Math.round(n / 3600) : null;
};

// Resolve the HLTB path with a simple, predictable order
const resolveHLTBPath = async () => {
  const candidates = [
    HLTB_ENV_PATH, // explicit override
    path.resolve("backend/data/hltb_data.json"), // project root
    path.join(__dirname, "../data/hltb_data.json"), // alongside this file
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* keep trying */
    }
  }
  return null;
};

// Load HLTB JSON (array of rows or {data:[...]}) into { normTitle: { main, plus, comp } }
const loadHLTBLocal = async (app) => {
  const chosen = await resolveHLTBPath();
  if (!chosen) {
    if (DEBUG) console.warn("[HLTB] no local HLTB file found");
    app.locals.hltbLookup = {};
    return;
  }

  try {
    const txt = await fs.readFile(chosen, "utf8");
    const parsed = JSON.parse(txt.replace(/^\uFEFF/, "")); // strip BOM if present

    const rows = Array.isArray(parsed)
      ? parsed
      : parsed?.data || parsed?.rows || parsed?.records;

    // If it's a keyed map already ({normTitle: {main,plus,comp}}), accept it as-is
    if (!rows && parsed && typeof parsed === "object") {
      const keys = Object.keys(parsed);
      const sample = keys.length ? parsed[keys[0]] : null;
      if (
        sample &&
        ("main" in sample || "plus" in sample || "comp" in sample)
      ) {
        app.locals.hltbLookup = parsed;
        if (DEBUG)
          console.log(`[HLTB] loaded keyed lookup (${keys.length} titles)`);
        return;
      }
      // else fall through to empty
    }

    if (!rows || !Array.isArray(rows)) {
      console.error("[HLTB] unrecognized JSON shape for file:", chosen);
      app.locals.hltbLookup = {};
      return;
    }

    const lookup = {};
    for (const row of rows) {
      const title = row?.game_game_name?.trim?.();
      if (!title) continue;

      // Mapping: main = main_med → fallback main_avg; plus = plus_med; comp = all_med
      const main =
        secToHourInt(row.game_comp_main_med) ??
        secToHourInt(row.game_comp_main_avg);
      const plus = secToHourInt(row.game_comp_plus_med);
      const comp = secToHourInt(row.game_comp_all_med);

      if (main != null || plus != null || comp != null) {
        lookup[normalizeTitle(title)] = { main, plus, comp };
      }
    }

    app.locals.hltbLookup = lookup;
    if (DEBUG)
      console.log(
        `[HLTB] loaded ${Object.keys(lookup).length} titles from: ${chosen}`
      );
  } catch (e) {
    console.error("[HLTB] load error:", e.message);
    app.locals.hltbLookup = {};
  }
};

// Get hours by preference: 'main' | 'plus' | 'comp' (default 'main')
const lookupHLTBHoursByPref = (app, rawTitle, pref = "main") => {
  if (!rawTitle) return null;
  const rec = app.locals?.hltbLookup?.[normalizeTitle(rawTitle)];
  if (!rec) return null;
  if (pref === "plus") return rec.plus ?? null;
  if (pref === "comp") return rec.comp ?? null;
  return rec.main ?? null;
};

/* -------------------- Routes -------------------- */

// GET all games for the authenticated user
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT g.*, s.rank AS status_rank
      FROM games g
      LEFT JOIN statuses s ON g.status = s.status
      WHERE g.user_id = $1
      ORDER BY s.rank ASC, g.position ASC NULLS LAST, g.id ASC
      `,
      [userId]
    );

    const rawgCache = req.app.locals.rawgCache || {};

    const games = await Promise.all(
      result.rows.map(async (game) => {
        const cacheKey = (game.name || "").toLowerCase().trim();
        if (!rawgCache[cacheKey]) {
          const data = await fetchGameData(game.name);
          rawgCache[cacheKey] = data || {};
          await saveCache(rawgCache);
        }

        const rawgData = rawgCache[cacheKey] || {};
        const dbHLTB =
          typeof game.how_long_to_beat === "number" && game.how_long_to_beat > 0
            ? game.how_long_to_beat
            : null;

        // Display-only fallback to RAWG if DB lacks hours (never store RAWG)
        const displayHLTB =
          dbHLTB ??
          (typeof rawgData?.playtime === "number" && rawgData.playtime > 0
            ? rawgData.playtime
            : null);

        return {
          ...game,
          cover: rawgData?.background_image || "",
          releaseDate: rawgData?.released || "",
          description: rawgData?.description || "",
          how_long_to_beat: displayHLTB,
          rating: rawgData?.rating || "",
          genres: rawgData?.genres?.map((g) => g.name).join(", ") || "Unknown",
          metacritic: rawgData?.metacritic || "N/A",
          stores:
            rawgData?.stores?.map((s) => ({
              store_id: s.store?.id,
              store_name: s.store?.name,
              url: s.url,
            })) || [],
          features: rawgData?.tags?.map((t) => t.name) || [],
        };
      })
    );

    res.json(games);
  } catch (err) {
    next(err);
  }
});

// POST create a new game (for the authenticated user)
router.post("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    let {
      name,
      status,
      how_long_to_beat,
      my_genre = "",
      thoughts = "",
      my_score,
      started_at, // optional manual date (YYYY-MM-DD)
      finished_at, // optional manual date (YYYY-MM-DD)
    } = req.body;

    if (!name || !status) {
      const err = new Error("Name and status are required");
      err.statusCode = 400;
      return next(err);
    }

    const rawgCache = req.app.locals.rawgCache || {};
    const cacheKey = name.toLowerCase().trim();
    let rawgData = rawgCache[cacheKey];

    if (!rawgData) {
      rawgData = await fetchGameData(name);
      rawgCache[cacheKey] = rawgData || {};
      await saveCache(rawgCache);
    }

    // Autofill HLTB from local file if user didn't provide hours
    const userHLTBPref = "main"; // future: make per-user
    if (!how_long_to_beat) {
      const hours = lookupHLTBHoursByPref(req.app, name, userHLTBPref);
      if (hours != null) {
        how_long_to_beat = hours; // already int
        if (DEBUG)
          console.log(
            `[HLTB] autofilled "${name}" → ${hours}h (${userHLTBPref})`
          );
      } else if (DEBUG) {
        console.log(`[HLTB] no local match for "${name}"`);
      }
    }

    const position = await getNextPosition(status, userId);

    // Auto-timestamps on initial status (manual values win)
    const sNorm = normStatus(status);
    let startedAtFinal = toDateOrNull(started_at);
    let finishedAtFinal = toDateOrNull(finished_at);

    if (!startedAtFinal && sNorm === "playing") {
      startedAtFinal = todayUTC();
    }
    if (!finishedAtFinal && DONE_FINISH_SET.has(sNorm)) {
      finishedAtFinal = todayUTC();
    }

    // Coerce to integer hours for DB
    const howLongToBeatInt = toHourInt(how_long_to_beat);

    const result = await pool.query(
      `INSERT INTO games
        (name, status, how_long_to_beat, my_genre, thoughts, my_score, position, user_id, started_at, finished_at)
       VALUES
        ($1,   $2,     $3,               $4,       $5,      $6,       $7,       $8,      $9,         $10)
       RETURNING *`,
      [
        name.trim(),
        status,
        howLongToBeatInt,
        my_genre.trim(),
        thoughts.trim(),
        my_score || null,
        position,
        userId,
        startedAtFinal,
        finishedAtFinal,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT update a game (must be owned by the user)
router.put("/:id", verifyToken, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const {
      name,
      status,
      how_long_to_beat,
      my_genre = "",
      thoughts = "",
      my_score,
      started_at, // optional manual date
      finished_at, // optional manual date
    } = req.body;

    if (!name || !status) {
      const err = new Error("Name and status are required");
      err.statusCode = 400;
      return next(err);
    }

    const existingGameRes = await pool.query(
      "SELECT * FROM games WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (existingGameRes.rows.length === 0) {
      const err = new Error("Game not found");
      err.statusCode = 404;
      return next(err);
    }

    const existingGame = existingGameRes.rows[0];
    let position = existingGame.position;
    if (status !== existingGame.status) {
      position = await getNextPosition(status, userId);
    }

    // Auto-timestamps on status transitions (manual values win)
    const prev = normStatus(existingGame.status);
    const next = normStatus(status);
    const changed = prev !== next;

    const wantsManualStart = Object.prototype.hasOwnProperty.call(
      req.body,
      "started_at"
    );
    const wantsManualFinish = Object.prototype.hasOwnProperty.call(
      req.body,
      "finished_at"
    );

    let startedAtFinal = wantsManualStart
      ? toDateOrNull(started_at)
      : existingGame.started_at;
    let finishedAtFinal = wantsManualFinish
      ? toDateOrNull(finished_at)
      : existingGame.finished_at;

    if (
      !wantsManualStart &&
      changed &&
      next === "playing" &&
      existingGame.started_at == null
    ) {
      startedAtFinal = todayUTC();
    }
    if (
      !wantsManualFinish &&
      changed &&
      DONE_FINISH_SET.has(next) &&
      existingGame.finished_at == null
    ) {
      finishedAtFinal = todayUTC();
    }
    // No auto-set for "played and wont come back"

    // Coerce to integer hours for DB
    const howLongToBeatInt = toHourInt(how_long_to_beat);

    const result = await pool.query(
      `UPDATE games
       SET name = $1,
           status = $2,
           how_long_to_beat = $3,
           my_genre = $4,
           thoughts = $5,
           my_score = $6,
           position = $7,
           started_at = $8,
           finished_at = $9
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [
        name.trim(),
        status,
        howLongToBeatInt,
        my_genre.trim(),
        thoughts.trim(),
        my_score || null,
        position,
        startedAtFinal,
        finishedAtFinal,
        id,
        userId,
      ]
    );

    if (result.rows.length === 0) {
      const err = new Error("Not authorized to edit this game");
      err.statusCode = 403;
      return next(err);
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE a game (must be owned by the user)
router.delete("/:id", verifyToken, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user.id;

    const result = await pool.query(
      "DELETE FROM games WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, userId]
    );

    if (result.rows.length === 0) {
      const err = new Error("Game not found");
      err.statusCode = 404;
      return next(err);
    }

    res.json({ message: "Game deleted successfully", game: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get("/statuses-list", async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT status FROM statuses ORDER BY rank ASC"
    );
    res.json(result.rows.map((row) => row.status));
  } catch (err) {
    next(err);
  }
});

// PATCH: reorder within a status rank (must be user's games)
router.patch("/:id/position", verifyToken, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { targetIndex, status } = req.body;
  const userId = req.user.id;

  if (typeof targetIndex !== "number" || !status) {
    const err = new Error("targetIndex and status are required");
    err.statusCode = 400;
    return next(err);
  }

  try {
    // Ensure the game exists and is owned by the user
    const exists = await pool.query(
      "SELECT id FROM games WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (exists.rows.length === 0) {
      const err = new Error("Game not found");
      err.statusCode = 404;
      return next(err);
    }

    // Get all games in the same RANK for this user
    const rankGames = await pool.query(
      `
      SELECT g.id, g.position, g.status
      FROM games g
      JOIN statuses s ON g.status = s.status
      WHERE s.rank = (SELECT rank FROM statuses WHERE status = $1)
        AND g.user_id = $2
      ORDER BY g.position ASC NULLS LAST, g.id ASC
      `,
      [status, userId]
    );

    if (rankGames.rows.length === 0) {
      const err = new Error("No games found in this rank for this user");
      err.statusCode = 404;
      return next(err);
    }

    const gameIndex = rankGames.rows.findIndex((g) => g.id === id);
    if (gameIndex === -1) {
      const err = new Error("Game not found in this rank");
      err.statusCode = 404;
      return next(err);
    }

    if (gameIndex === targetIndex) {
      const game = await pool.query(
        "SELECT * FROM games WHERE id = $1 AND user_id = $2",
        [id, userId]
      );
      return res.json(game.rows[0]);
    }

    // Build new order of ids for this user's rank
    const gameIds = rankGames.rows.map((g) => g.id);
    gameIds.splice(gameIndex, 1);
    gameIds.splice(targetIndex, 0, id);

    // Update positions (scoped by user for safety)
    const updates = gameIds.map((gameId, index) => {
      const newPosition = (index + 1) * DEFAULT_POSITION_SPACING;
      return pool.query(
        "UPDATE games SET position = $1 WHERE id = $2 AND user_id = $3",
        [newPosition, gameId, userId]
      );
    });

    await Promise.all(updates);

    const result = await pool.query(
      "SELECT * FROM games WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/* -------------------- Startup -------------------- */

export const initCache = async (app) => {
  await loadCache(app); // RAWG cache
  await loadHLTBLocal(app); // HLTB JSON
};

export default router;
