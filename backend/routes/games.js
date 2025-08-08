// backend/routes/games.js
import express from "express";
import { pool } from "../db.js";
import { fetchGameData } from "../utils/fetchRAWG.js";
import { verifyToken } from "../middleware/auth.js";
import fs from "fs/promises";
import path from "path";

const router = express.Router();
const CACHE_PATH = path.resolve("backend/data/cached_rawg_data.json");
const DEFAULT_POSITION_SPACING = 1000;

const loadCache = async (app) => {
  try {
    const data = await fs.readFile(CACHE_PATH, "utf-8");
    app.locals.rawgCache = JSON.parse(data);
    console.log("RAWG cache loaded from disk");
  } catch (err) {
    // If file doesn't exist or parse fails, start with empty cache
    app.locals.rawgCache = {};
    console.log("No RAWG cache found, starting fresh");
  }
};

const saveCache = async (cache) => {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log("RAWG cache saved to disk");
  } catch (err) {
    console.error("Failed to save RAWG cache:", err);
  }
};

/**
 * Get the next position for a status scoped to a user
 * (so each user has independent sparse ranking)
 */
const getNextPosition = async (status, userId) => {
  const result = await pool.query(
    "SELECT MAX(position) as max FROM games WHERE status = $1 AND user_id = $2",
    [status, userId]
  );
  return (result.rows[0].max || 0) + DEFAULT_POSITION_SPACING;
};

router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT g.*, s.rank AS status_rank
      FROM games g
      LEFT JOIN statuses s ON g.status = s.status
      WHERE g.user_id = $1
      ORDER BY s.rank ASC, g.position ASC NULLS LAST, g.id ASC;
      `,
      [userId]
    );

    const rawgCache = req.app.locals.rawgCache || {};
    const games = await Promise.all(
      result.rows.map(async (game) => {
        const cacheKey = (game.name || "").toLowerCase();
        if (!rawgCache[cacheKey]) {
          const data = await fetchGameData(game.name);
          rawgCache[cacheKey] = data || {};
          // Persist the cache after fetching to keep it durable
          await saveCache(rawgCache);
        }
        const rawgData = rawgCache[cacheKey] || {};
        return {
          ...game,
          cover: rawgData?.background_image || "",
          releaseDate: rawgData?.released || "",
          description: rawgData?.description || "",
          how_long_to_beat:
            typeof game.how_long_to_beat === "number" &&
            game.how_long_to_beat > 0
              ? game.how_long_to_beat
              : typeof rawgData?.playtime === "number" && rawgData.playtime > 0
                ? rawgData.playtime
                : null,
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
    } = req.body;

    if (!name || !status) {
      const err = new Error("Name and status are required");
      err.statusCode = 400;
      return next(err);
    }

    // RAWG caching/enrichment (shared cache across users)
    const rawgCache = req.app.locals.rawgCache || {};
    const cacheKey = name.toLowerCase();
    let rawgData = rawgCache[cacheKey];
    if (!rawgData) {
      rawgData = await fetchGameData(name);
      if (rawgData) {
        rawgCache[cacheKey] = rawgData;
        await saveCache(rawgCache);
      } else {
        // Ensure cache has at least an empty object to avoid repeated failing fetches
        rawgCache[cacheKey] = rawgData || {};
      }
    }

    const position = await getNextPosition(status, userId);

    const result = await pool.query(
      `INSERT INTO games (name, status, how_long_to_beat, my_genre, thoughts, my_score, position, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *;`,
      [
        name.trim(),
        status,
        how_long_to_beat || null,
        my_genre.trim(),
        thoughts.trim(),
        my_score || null,
        position,
        userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      name,
      status,
      how_long_to_beat,
      my_genre = "",
      thoughts = "",
      my_score,
    } = req.body;

    if (!name || !status) {
      const err = new Error("Name and status are required");
      err.statusCode = 400;
      return next(err);
    }

    const existingGameRes = await pool.query(
      "SELECT * FROM games WHERE id = $1",
      [id]
    );
    if (existingGameRes.rows.length === 0) {
      const err = new Error("Game not found");
      err.statusCode = 404;
      return next(err);
    }

    const existingGame = existingGameRes.rows[0];
    if (existingGame.user_id !== userId) {
      const err = new Error("Not authorized to edit this game");
      err.statusCode = 403;
      return next(err);
    }

    let position = existingGame.position;
    if (status !== existingGame.status) {
      position = await getNextPosition(status, userId);
    }

    const result = await pool.query(
      `UPDATE games 
       SET name = $1, status = $2, how_long_to_beat = $3, my_genre = $4, thoughts = $5, my_score = $6, position = $7
       WHERE id = $8
       RETURNING *;`,
      [
        name.trim(),
        status,
        how_long_to_beat || null,
        my_genre.trim(),
        thoughts.trim(),
        my_score || null,
        position,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await pool.query(
      "SELECT user_id, name FROM games WHERE id = $1",
      [id]
    );
    if (existing.rows.length === 0) {
      const err = new Error("Game not found");
      err.statusCode = 404;
      return next(err);
    }
    if (existing.rows[0].user_id !== userId) {
      const err = new Error("Not authorized to delete this game");
      err.statusCode = 403;
      return next(err);
    }

    const result = await pool.query(
      "DELETE FROM games WHERE id = $1 RETURNING *;",
      [id]
    );

    res.json({ message: "Game deleted successfully", game: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/position", verifyToken, async (req, res, next) => {
  const { id } = req.params;
  const { targetIndex, status } = req.body;
  const userId = req.user.id;

  if (typeof targetIndex !== "number" || !status) {
    const err = new Error("targetIndex and status are required");
    err.statusCode = 400;
    return next(err);
  }

  try {
    // Get all games for this user's status rank
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

    const gameIndex = rankGames.rows.findIndex((g) => g.id === parseInt(id));
    if (gameIndex === -1) {
      const err = new Error("Game not found in this rank");
      err.statusCode = 404;
      return next(err);
    }

    // If target index is the same, return current game
    if (gameIndex === targetIndex) {
      const game = await pool.query("SELECT * FROM games WHERE id = $1", [id]);
      return res.json(game.rows[0]);
    }

    // Build new order of ids for this user's rank
    const gameIds = rankGames.rows.map((g) => g.id);
    // Remove moving game
    gameIds.splice(gameIndex, 1);
    // Insert at new position
    gameIds.splice(targetIndex, 0, parseInt(id));

    // Update positions (sparse spacing)
    const updates = gameIds.map((gameId, index) => {
      const newPosition = (index + 1) * DEFAULT_POSITION_SPACING;
      return pool.query("UPDATE games SET position = $1 WHERE id = $2", [
        newPosition,
        gameId,
      ]);
    });

    await Promise.all(updates);

    const result = await pool.query("SELECT * FROM games WHERE id = $1", [id]);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Export initCache to be called on server start
export const initCache = loadCache;
export default router;
