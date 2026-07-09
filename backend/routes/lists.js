import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import {
  addListGame,
  createList,
  listGameParams,
  listParams,
  reorderListGames,
  updateList,
} from "../validators/lists.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";

const router = express.Router();
const POSITION_SPACING = 1000;

function normalizeCacheKey(value) {
  return String(value || "").trim().toLowerCase();
}

function rawgForGame(cache = {}, row = {}) {
  const keys = [
    row.rawg_id ? `rawg:${row.rawg_id}` : "",
    row.rawg_slug,
    row.name,
    row.catalog_name,
  ]
    .map(normalizeCacheKey)
    .filter(Boolean);

  for (const key of keys) {
    const entry = cache[key];
    if (entry && typeof entry === "object" && !entry.__failedAt) return entry;
  }
  return null;
}

function serializeGame(row = {}, cache = {}) {
  const rawg = rawgForGame(cache, row);
  const catalogGenres = Array.isArray(row.catalog_genres_json)
    ? row.catalog_genres_json
    : [];
  const rawgGenres = Array.isArray(rawg?.genres)
    ? rawg.genres.map((genre) => genre?.name).filter(Boolean)
    : [];
  return {
    ...row,
    displayName: row.catalog_name || rawg?.name || row.name,
    cover:
      row.catalog_cover_url ||
      row.cover ||
      rawg?.cover ||
      rawg?.background_image ||
      null,
    releaseDate: row.catalog_released_at || rawg?.released || null,
    rating: row.catalog_rawg_rating == null ? null : Number(row.catalog_rawg_rating),
    rawgRating:
      row.catalog_rawg_rating == null ? null : Number(row.catalog_rawg_rating),
    metacritic: row.catalog_metacritic ?? null,
    genres: catalogGenres
      .map((genre) => genre?.name || genre)
      .filter(Boolean)
      .join(", ") || rawgGenres.join(", ") || null,
    how_long_to_beat:
      row.how_long_to_beat ?? row.catalog_rawg_playtime_hours ?? null,
    list_position: row.list_position ?? null,
    list_added_at: row.list_added_at ?? null,
  };
}

function serializeList(row = {}, games = []) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description || "",
    visibility: row.visibility || "private",
    listType: row.list_type || "manual",
    query: row.query_json || null,
    sortKey: row.sort_key || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    gameCount: Number(row.game_count || games.length || 0),
    previewGames: games.slice(0, 4),
  };
}

async function selectOwnedList(client, listId, userId, columns = "l.*") {
  const { rows } = await client.query(
    `
      SELECT ${columns}
      FROM user_lists l
      WHERE l.id = $1 AND l.user_id = $2
    `,
    [listId, userId]
  );
  return rows[0] || null;
}

async function listGamesForList(client, listId, userId, { limit, cache } = {}) {
  const limitSql = limit ? "LIMIT $3" : "";
  const values = limit ? [listId, userId, limit] : [listId, userId];
  const { rows } = await client.query(
    `
      SELECT g.*,
             ulg.position AS list_position,
             ulg.added_at AS list_added_at,
             s.rank AS status_rank,
             cg.name AS catalog_name,
             cg.cover_url AS catalog_cover_url,
             cg.released_at AS catalog_released_at,
             cg.rawg_rating AS catalog_rawg_rating,
             cg.metacritic AS catalog_metacritic,
             cg.rawg_playtime_hours AS catalog_rawg_playtime_hours,
             cg.genres_json AS catalog_genres_json
      FROM user_list_games ulg
      JOIN user_lists l ON l.id = ulg.list_id
      JOIN games g ON g.id = ulg.game_id AND g.user_id = l.user_id
      LEFT JOIN statuses s ON s.status = g.status
      LEFT JOIN catalog_games cg ON cg.id = g.catalog_game_id
      WHERE ulg.list_id = $1
        AND l.user_id = $2
      ORDER BY ulg.position NULLS LAST, ulg.added_at, g.id
      ${limitSql}
    `,
    values
  );
  return rows.map((row) => serializeGame(row, cache));
}

async function touchList(client, listId, userId) {
  await client.query(
    `
      UPDATE user_lists
      SET updated_at = NOW()
      WHERE id = $1 AND user_id = $2
    `,
    [listId, userId]
  );
}

router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `
        SELECT l.*,
               COUNT(ulg.game_id)::int AS game_count
        FROM user_lists l
        LEFT JOIN user_list_games ulg ON ulg.list_id = l.id
        WHERE l.user_id = $1
        GROUP BY l.id
        ORDER BY l.updated_at DESC, l.id DESC
      `,
      [userId]
    );

    const lists = [];
    for (const row of rows) {
      const previewGames = await listGamesForList(pool, row.id, userId, {
        limit: 4,
        cache: req.app.locals.rawgCache || {},
      });
      lists.push(serializeList(row, previewGames));
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ lists });
  } catch (err) {
    next(err);
  }
});

router.post("/", verifyToken, createList, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      name,
      description = null,
      listType = "manual",
      query = null,
      sortKey = null,
    } = req.body || {};
    const type = listType === "smart" ? "smart" : "manual";
    const { rows } = await pool.query(
      `
        INSERT INTO user_lists (user_id, name, description, visibility, list_type, query_json, sort_key)
        VALUES ($1, $2, $3, 'private', $4, $5, $6)
        RETURNING *
      `,
      [
        userId,
        name,
        description || null,
        type,
        type === "smart" ? query || {} : null,
        type === "smart" ? sortKey || "score" : null,
      ]
    );
    res.status(201).json({ list: serializeList(rows[0], []) });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", verifyToken, listParams, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const listId = Number(req.params.id);
    const { rows } = await pool.query(
      `
        SELECT l.*,
               COUNT(ulg.game_id)::int AS game_count
        FROM user_lists l
        LEFT JOIN user_list_games ulg ON ulg.list_id = l.id
        WHERE l.id = $1 AND l.user_id = $2
        GROUP BY l.id
      `,
      [listId, userId]
    );
    const list = rows[0];
    if (!list) return next(notFound("List not found"));

    const games = await listGamesForList(pool, listId, userId, {
      cache: req.app.locals.rawgCache || {},
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ list: serializeList(list, games.slice(0, 4)), games });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", verifyToken, updateList, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const listId = Number(req.params.id);
    const { name, description = null, query, sortKey } = req.body || {};
    const { rows } = await pool.query(
      `
        UPDATE user_lists
        SET name = $1,
            description = $2,
            query_json = CASE WHEN list_type = 'smart' THEN $5 ELSE query_json END,
            sort_key = CASE WHEN list_type = 'smart' THEN $6 ELSE sort_key END,
            updated_at = NOW()
        WHERE id = $3 AND user_id = $4
        RETURNING *
      `,
      [name, description || null, listId, userId, query || {}, sortKey || "score"]
    );
    if (!rows[0]) return next(notFound("List not found"));
    const games = await listGamesForList(pool, listId, userId, {
      limit: 4,
      cache: req.app.locals.rawgCache || {},
    });
    res.json({ list: serializeList(rows[0], games) });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", verifyToken, listParams, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const listId = Number(req.params.id);
    const { rows } = await pool.query(
      `
        DELETE FROM user_lists
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `,
      [listId, userId]
    );
    if (!rows[0]) return next(notFound("List not found"));
    res.json({ list: serializeList(rows[0], []) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/games", verifyToken, addListGame, async (req, res, next) => {
  let client;
  try {
    const userId = req.user.id;
    const listId = Number(req.params.id);
    const gameId = Number(req.body?.gameId);

    client = await pool.connect();
    await client.query("BEGIN");

    const list = await selectOwnedList(client, listId, userId);
    if (!list) {
      await client.query("ROLLBACK");
      return next(notFound("List not found"));
    }
    if ((list.list_type || "manual") !== "manual") {
      await client.query("ROLLBACK");
      return next(badRequest("Smart lists do not support manual game membership."));
    }

    const gameRes = await client.query(
      "SELECT id FROM games WHERE id = $1 AND user_id = $2",
      [gameId, userId]
    );
    if (!gameRes.rows[0]) {
      await client.query("ROLLBACK");
      return next(badRequest("Game must belong to your backlog."));
    }

    const duplicate = await client.query(
      "SELECT 1 FROM user_list_games WHERE list_id = $1 AND game_id = $2",
      [listId, gameId]
    );
    if (duplicate.rows[0]) {
      await client.query("ROLLBACK");
      return next(conflict("Game is already in this list."));
    }

    const positionRes = await client.query(
      `
        SELECT COALESCE(MAX(position), 0) + $2 AS next_position
        FROM user_list_games
        WHERE list_id = $1
      `,
      [listId, POSITION_SPACING]
    );
    await client.query(
      `
        INSERT INTO user_list_games (list_id, game_id, position)
        VALUES ($1, $2, $3)
      `,
      [listId, gameId, positionRes.rows[0]?.next_position || POSITION_SPACING]
    );
    await touchList(client, listId, userId);
    await client.query("COMMIT");

    const games = await listGamesForList(pool, listId, userId, {
      cache: req.app.locals.rawgCache || {},
    });
    res.status(201).json({ games });
  } catch (err) {
    try {
      await client?.query("ROLLBACK");
    } catch {}
    next(err);
  } finally {
    client?.release();
  }
});

router.delete(
  "/:id/games/:gameId",
  verifyToken,
  listGameParams,
  async (req, res, next) => {
    let client;
    try {
      const userId = req.user.id;
      const listId = Number(req.params.id);
      const gameId = Number(req.params.gameId);

      client = await pool.connect();
      await client.query("BEGIN");

      const list = await selectOwnedList(client, listId, userId);
      if (!list) {
        await client.query("ROLLBACK");
        return next(notFound("List not found"));
      }
      if ((list.list_type || "manual") !== "manual") {
        await client.query("ROLLBACK");
        return next(badRequest("Smart lists do not support manual game membership."));
      }

      const { rows } = await client.query(
        `
          DELETE FROM user_list_games
          WHERE list_id = $1
            AND game_id = $2
          RETURNING game_id
        `,
        [listId, gameId]
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return next(notFound("Game not found in this list"));
      }

      await touchList(client, listId, userId);
      await client.query("COMMIT");

      const games = await listGamesForList(pool, listId, userId, {
        cache: req.app.locals.rawgCache || {},
      });
      res.json({ games });
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

router.patch(
  "/:id/games/reorder",
  verifyToken,
  reorderListGames,
  async (req, res, next) => {
    let client;
    try {
      const userId = req.user.id;
      const listId = Number(req.params.id);
      const { gameIds, gameId, targetIndex } = req.body || {};

      client = await pool.connect();
      await client.query("BEGIN");

      const list = await selectOwnedList(client, listId, userId);
      if (!list) {
        await client.query("ROLLBACK");
        return next(notFound("List not found"));
      }
      if ((list.list_type || "manual") !== "manual") {
        await client.query("ROLLBACK");
        return next(badRequest("Smart lists do not support manual ordering."));
      }

      const currentRes = await client.query(
        `
          SELECT ulg.game_id
          FROM user_list_games ulg
          JOIN games g ON g.id = ulg.game_id
          WHERE ulg.list_id = $1
            AND g.user_id = $2
          ORDER BY ulg.position NULLS LAST, ulg.added_at, ulg.game_id
          FOR UPDATE OF ulg
        `,
        [listId, userId]
      );
      const currentIds = currentRes.rows.map((row) => Number(row.game_id));
      if (!currentIds.length) {
        await client.query("ROLLBACK");
        return next(badRequest("List has no games to reorder."));
      }

      let orderedIds;
      if (Array.isArray(gameIds)) {
        orderedIds = gameIds.map(Number);
        const currentSet = new Set(currentIds);
        const sameLength = orderedIds.length === currentIds.length;
        const sameMembers =
          sameLength && orderedIds.every((id) => currentSet.has(id));
        if (!sameMembers) {
          await client.query("ROLLBACK");
          return next(badRequest("gameIds must match the games in this list."));
        }
      } else {
        const movingId = Number(gameId);
        const fromIndex = currentIds.indexOf(movingId);
        if (fromIndex === -1) {
          await client.query("ROLLBACK");
          return next(notFound("Game not found in this list"));
        }
        orderedIds = [...currentIds];
        const [moved] = orderedIds.splice(fromIndex, 1);
        const clampedIndex = Math.max(
          0,
          Math.min(Math.trunc(targetIndex), orderedIds.length)
        );
        orderedIds.splice(clampedIndex, 0, moved);
      }

      const positions = orderedIds.map((_, index) => index * POSITION_SPACING);
      await client.query(
        `
          UPDATE user_list_games AS ulg
          SET position = v.position
          FROM (
            SELECT unnest($1::int[]) AS game_id,
                   unnest($2::int[]) AS position
          ) AS v
          WHERE ulg.list_id = $3
            AND ulg.game_id = v.game_id
        `,
        [orderedIds, positions, listId]
      );
      await touchList(client, listId, userId);
      await client.query("COMMIT");

      const games = await listGamesForList(pool, listId, userId, {
        cache: req.app.locals.rawgCache || {},
      });
      res.json({ games });
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

export default router;
