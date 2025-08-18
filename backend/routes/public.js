// backend/routes/public.js
import express from "express";
import { pool } from "../db.js";
import { fetchGameData } from "../utils/fetchRAWG.js";
import {
  sanitizeGameHtml /* or sanitizeGameHtmlWithLinks */,
} from "../utils/sanitizeHtml.js";
const router = express.Router();

// helper: sanitize usernames a bit (letters, digits, underscore, dash, dot)
const USERNAME_RE = /^[\w.-]{3,30}$/;

// DRY-ish: hydrate with RAWG, mirroring /api/games behavior
async function hydrateGamesWithRAWG(app, games) {
  const rawgCache = app.locals.rawgCache || {};

  const hydrated = await Promise.all(
    games.map(async (game) => {
      const cacheKey = (game.name || "").toLowerCase().trim();
      if (!rawgCache[cacheKey]) {
        const data = await fetchGameData(game.name);
        rawgCache[cacheKey] = data || {};
      }
      const rawgData = rawgCache[cacheKey] || {};
      return {
        ...game,
        cover: rawgData?.background_image || "",
        releaseDate: rawgData?.released || "",
        description: sanitizeGameHtml(rawgData?.description),
        how_long_to_beat:
          typeof game.how_long_to_beat === "number" && game.how_long_to_beat > 0
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

  // write-through save happens in your private route; also safe to save here:
  app.locals.rawgCache = rawgCache;
  return hydrated;
}

// GET /api/public/:username (profile header info)
router.get("/:username", async (req, res, next) => {
  try {
    const { username } = req.params;
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: "Invalid username" });
    }

    const userRes = await pool.query(
      "SELECT id, username, is_public, created_at FROM users WHERE username = $1",
      [username]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = userRes.rows[0];

    if (!user.is_public) {
      return res.status(403).json({ error: "This profile is not public" });
    }

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS game_count FROM games WHERE user_id = $1",
      [user.id]
    );

    return res.json({
      username: user.username,
      is_public: true,
      game_count: countRes.rows[0].game_count || 0,
      joined_at: user.created_at,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/:username/games (read-only games)
router.get("/:username/games", async (req, res, next) => {
  try {
    const { username } = req.params;
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: "Invalid username" });
    }

    // 1) Find user & verify they opted in to public
    const userRes = await pool.query(
      "SELECT id, is_public FROM users WHERE username = $1",
      [username]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = userRes.rows[0];
    if (!user.is_public) {
      return res.status(403).json({ error: "This profile is not public" });
    }

    // 2) Fetch games like your private route does (rank + position)
    const gamesRes = await pool.query(
      `
      SELECT g.*, s.rank AS status_rank
      FROM games g
      LEFT JOIN statuses s ON g.status = s.status
      WHERE g.user_id = $1
      ORDER BY s.rank ASC, g.position ASC NULLS LAST, g.id ASC
      `,
      [user.id]
    );

    // 3) Hydrate with RAWG to match the private payload shape
    const hydrated = await hydrateGamesWithRAWG(req.app, gamesRes.rows);

    // 4) For public response you may omit sensitive columns
    const scrubbed = hydrated.map(({ user_id, ...rest }) => rest);
    res.json(scrubbed);
  } catch (err) {
    next(err);
  }
});

export default router;
