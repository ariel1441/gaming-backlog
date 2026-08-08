// backend/routes/public.js
import express from "express";
import { pool } from "../db.js";
import { decorateGameWithCatalog } from "../services/catalogService.js";
import { listPublicGamesQuery } from "../utils/publicAccess.js";
import { usernameParam } from "../validators/public.js";
import { forbidden, notFound } from "../utils/httpError.js";
const router = express.Router();
// Public profile rendering is strictly PostgreSQL-backed and never hydrates RAWG.
export function serializePublicGames(games) {
  return games.map((game) => {
    const personalGenres = Array.isArray(game.personal_genres)
      ? game.personal_genres.map((genre) => ({ name: genre.name }))
      : [];
    const catalog = decorateGameWithCatalog(game);
    return {
      id: game.id,
      name: game.name,
      status: game.status,
      status_rank: game.status_rank,
      position: game.position,
      my_genre: personalGenres.map((genre) => genre.name).join(", ") || null,
      personal_genres: personalGenres,
      how_long_to_beat: game.how_long_to_beat,
      favorite_rank: game.favorite_rank,
      started_at: game.started_at,
      finished_at: game.finished_at,
      displayName: catalog?.displayName || game.name,
      cover: catalog?.cover || game.cover || null,
      releaseDate: catalog?.releaseDate || null,
      description: catalog?.description || "",
      rating: catalog?.rating ?? null,
      rawgRating: catalog?.rating ?? null,
      genres: catalog?.genres || null,
      metacritic: catalog?.metacritic ?? null,
      stores: catalog?.stores || null,
      features: catalog?.features || null,
      metadataQuality: catalog?.metadataQuality || "legacy",
    };
  });
}

// GET /api/public/:username (profile header info)
router.get("/:username", usernameParam, async (req, res, next) => {
  try {
    const { username } = req.params;

    const userRes = await pool.query(
      `SELECT id,
              username,
              is_public,
              created_at,
              display_name,
              bio,
              avatar_icon,
              avatar_color
         FROM users
        WHERE username = $1`,
      [username]
    );
    if (userRes.rows.length === 0) {
      return next(notFound("User not found"));
    }
    const user = userRes.rows[0];

    if (!user.is_public) {
      return next(forbidden("This profile is not public"));
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
      display_name: user.display_name || "",
      bio: user.bio || "",
      avatar_icon: user.avatar_icon || "gamepad",
      avatar_color: user.avatar_color || "orange",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/:username/games (read-only games)
router.get("/:username/games", usernameParam, async (req, res, next) => {
  try {
    const { username } = req.params;

    // 1) Find user & verify they opted in to public
    const userRes = await pool.query(
      "SELECT id, is_public FROM users WHERE username = $1",
      [username]
    );
    if (userRes.rows.length === 0) {
      return next(notFound("User not found"));
    }
    const user = userRes.rows[0];
    if (!user.is_public) {
      return next(forbidden("This profile is not public"));
    }

    // 2) Fetch games like your private route does (rank + position)
    const publicGamesQuery = listPublicGamesQuery(user.id);
    const gamesRes = await pool.query(publicGamesQuery.text, publicGamesQuery.values);

    // 3) Serialize durable catalog metadata without provider requests.
    const hydrated = serializePublicGames(gamesRes.rows);

    // 4) For public response you may omit sensitive columns
    const scrubbed = hydrated.map(
      ({ user_id: _user_id, resume_note: _resume_note, ...rest }) => rest,
    );
    res.json(scrubbed);
  } catch (err) {
    next(err);
  }
});

export default router;
