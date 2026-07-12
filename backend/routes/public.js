// backend/routes/public.js
import express from "express";
import { pool } from "../db.js";
import { fetchGameData } from "../utils/fetchRAWG.js";
import {
  sanitizeGameHtml /* or sanitizeGameHtmlWithLinks */,
} from "../utils/sanitizeHtml.js";
import { decorateGameWithCatalog } from "../services/catalogService.js";
import { listPublicGamesQuery } from "../utils/publicAccess.js";
import { usernameParam } from "../validators/public.js";
import { forbidden, notFound } from "../utils/httpError.js";
const router = express.Router();
const PUBLIC_RAWG_CONCURRENCY = Math.min(
  Math.max(Number(process.env.PUBLIC_RAWG_CONCURRENCY) || 3, 1),
  8,
);
const PUBLIC_RAWG_HYDRATE_LIMIT = Math.min(
  Math.max(Number(process.env.PUBLIC_RAWG_HYDRATE_LIMIT) || 24, 0),
  100,
);
const RAWG_CACHE_MAX_ENTRIES = Math.min(
  Math.max(Number(process.env.RAWG_CACHE_MAX_ENTRIES) || 1000, 100),
  10_000,
);
const RAWG_FAILURE_TTL_MS = 5 * 60 * 1000;

async function mapWithConcurrency(items, concurrency, work) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await work(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

function pruneRawgCache(cache) {
  const keys = Object.keys(cache);
  const removeCount = keys.length - RAWG_CACHE_MAX_ENTRIES;
  if (removeCount <= 0) return;
  keys.slice(0, removeCount).forEach((key) => delete cache[key]);
}

function shouldFetchRawg(entry) {
  if (!entry) return true;
  return Boolean(
    entry.__failedAt && Date.now() - entry.__failedAt > RAWG_FAILURE_TTL_MS,
  );
}

// DRY-ish: hydrate with RAWG, mirroring /api/games behavior
export async function hydrateGamesWithRAWG(app, games) {
  const rawgCache = app.locals.rawgCache || {};
  const inflight = app.locals.publicRawgInflight || new Map();
  app.locals.publicRawgInflight = inflight;

  const hydrated = await mapWithConcurrency(
    games,
    PUBLIC_RAWG_CONCURRENCY,
    async (game, index) => {
      const catalog = decorateGameWithCatalog(game);
      if (catalog) {
        return {
          ...game,
          ...catalog,
        };
      }

      const cacheKey = (game.name || "").toLowerCase().trim();
      if (
        cacheKey &&
        index < PUBLIC_RAWG_HYDRATE_LIMIT &&
        shouldFetchRawg(rawgCache[cacheKey])
      ) {
        let request = inflight.get(cacheKey);
        if (!request) {
          request = fetchGameData(game.name)
            .then((data) => {
              rawgCache[cacheKey] = data || {};
            })
            .catch(() => {
              rawgCache[cacheKey] = { __failedAt: Date.now() };
            })
            .finally(() => inflight.delete(cacheKey));
          inflight.set(cacheKey, request);
        }
        await request;
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
    },
  );

  // write-through save happens in your private route; also safe to save here:
  app.locals.rawgCache = rawgCache;
  pruneRawgCache(rawgCache);
  return hydrated;
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

    // 3) Hydrate with RAWG to match the private payload shape
    const hydrated = await hydrateGamesWithRAWG(req.app, gamesRes.rows);

    // 4) For public response you may omit sensitive columns
    const scrubbed = hydrated.map(({ user_id: _user_id, ...rest }) => rest);
    res.json(scrubbed);
  } catch (err) {
    next(err);
  }
});

export default router;
