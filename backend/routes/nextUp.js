import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { nextUpGameId, reorderNextUp } from "../validators/nextUp.js";
import { statusGroupOf } from "../utils/status.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { selectOwnedGameDetailsQuery } from "../utils/gameAccess.js";
import { decorateGameForClient } from "./games.js";

const router = express.Router();
const POSITION_SPACING = 1000;
const LOCK_NAMESPACE = 73192;
const TODAY_SQL = "(now() AT TIME ZONE 'Asia/Jerusalem')::date";

async function lockQueue(client, userId) {
  await client.query("SELECT pg_advisory_xact_lock($1, $2)", [
    LOCK_NAMESPACE,
    Number(userId),
  ]);
}

async function lockedQueueRows(client, userId) {
  const result = await client.query(
    `SELECT n.game_id, n.position
       FROM user_next_up_games n
       JOIN games g ON g.id = n.game_id AND g.user_id = n.user_id
      WHERE n.user_id = $1
      ORDER BY n.position, n.game_id
      FOR UPDATE OF n`,
    [userId],
  );
  return result.rows;
}

async function compactQueue(client, userId, rows = null) {
  const ordered = rows || (await lockedQueueRows(client, userId));
  if (ordered.length) {
    const ids = ordered.map((row) => Number(row.game_id));
    const positions = ordered.map((_, index) => index * POSITION_SPACING);
    await client.query(
      `UPDATE user_next_up_games AS n
          SET position = v.position
         FROM (
           SELECT unnest($1::int[]) AS game_id,
                  unnest($2::int[]) AS position
         ) AS v
        WHERE n.user_id = $3 AND n.game_id = v.game_id`,
      [ids, positions, userId],
    );
  }
  return ordered.map((row) => Number(row.game_id));
}

router.get("/", verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT n.game_id, n.position, n.added_at
         FROM user_next_up_games n
         JOIN games g ON g.id = n.game_id AND g.user_id = n.user_id
        WHERE n.user_id = $1
        ORDER BY n.position, n.game_id`,
      [req.user.id],
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({
      gameIds: result.rows.map((row) => Number(row.game_id)),
      queue: result.rows.map((row, index) => ({
        gameId: Number(row.game_id),
        position: index,
        addedAt: row.added_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:gameId", verifyToken, nextUpGameId, async (req, res, next) => {
  let client;
  try {
    const userId = req.user.id;
    const gameId = Number(req.params.gameId);
    client = await pool.connect();
    await client.query("BEGIN");
    await lockQueue(client, userId);
    const gameResult = await client.query(
      "SELECT id, status FROM games WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [gameId, userId],
    );
    const game = gameResult.rows[0];
    if (!game) throw notFound("Game not found");
    if (["playing", "done"].includes(statusGroupOf(game.status))) {
      throw badRequest("Playing and done games cannot be added to Next Up.");
    }
    const existing = await client.query(
      "SELECT 1 FROM user_next_up_games WHERE user_id = $1 AND game_id = $2",
      [userId, gameId],
    );
    if (existing.rows[0]) throw conflict("Game is already in Next Up.");
    const queue = await lockedQueueRows(client, userId);
    const maxPosition = queue.reduce(
      (max, row) => Math.max(max, Number(row.position) || 0),
      -POSITION_SPACING,
    );
    const position = maxPosition + POSITION_SPACING;
    await client.query(
      `INSERT INTO user_next_up_games (user_id, game_id, position)
       VALUES ($1, $2, $3)`,
      [userId, gameId, position],
    );
    await client.query("COMMIT");
    res.status(201).json({
      gameId,
      position: queue.length,
      gameIds: [...queue.map((row) => Number(row.game_id)), gameId],
    });
  } catch (error) {
    try {
      await client?.query("ROLLBACK");
    } catch {}
    next(error);
  } finally {
    client?.release();
  }
});

router.delete("/:gameId", verifyToken, nextUpGameId, async (req, res, next) => {
  let client;
  try {
    const userId = req.user.id;
    const gameId = Number(req.params.gameId);
    client = await pool.connect();
    await client.query("BEGIN");
    await lockQueue(client, userId);
    const removed = await client.query(
      `DELETE FROM user_next_up_games
        WHERE user_id = $1 AND game_id = $2
        RETURNING game_id`,
      [userId, gameId],
    );
    if (!removed.rows[0]) throw notFound("Game is not in Next Up.");
    const gameIds = await compactQueue(client, userId);
    await client.query("COMMIT");
    res.json({ gameId, gameIds });
  } catch (error) {
    try {
      await client?.query("ROLLBACK");
    } catch {}
    next(error);
  } finally {
    client?.release();
  }
});

router.put("/reorder", verifyToken, reorderNextUp, async (req, res, next) => {
  let client;
  try {
    const userId = req.user.id;
    const gameIds = req.body.gameIds.map(Number);
    client = await pool.connect();
    await client.query("BEGIN");
    await lockQueue(client, userId);
    const current = await lockedQueueRows(client, userId);
    const currentIds = current.map((row) => Number(row.game_id));
    if (
      gameIds.length !== currentIds.length ||
      gameIds.some((id) => !currentIds.includes(id))
    ) {
      throw badRequest("Reorder must include the complete current queue.");
    }
    await compactQueue(
      client,
      userId,
      gameIds.map((gameId) => ({ game_id: gameId })),
    );
    await client.query("COMMIT");
    res.json({ gameIds });
  } catch (error) {
    try {
      await client?.query("ROLLBACK");
    } catch {}
    next(error);
  } finally {
    client?.release();
  }
});

router.post(
  "/:gameId/start",
  verifyToken,
  nextUpGameId,
  async (req, res, next) => {
    let client;
    try {
      const userId = req.user.id;
      const gameId = Number(req.params.gameId);
      client = await pool.connect();
      await client.query("BEGIN");
      await lockQueue(client, userId);
      const gameResult = await client.query(
        `SELECT g.*
           FROM games g
           JOIN user_next_up_games n
             ON n.game_id = g.id AND n.user_id = g.user_id
          WHERE g.id = $1 AND g.user_id = $2
          FOR UPDATE OF g, n`,
        [gameId, userId],
      );
      if (!gameResult.rows[0]) {
        throw notFound("Queued game not found.");
      }
      const updated = await client.query(
        `UPDATE games
            SET status = 'playing',
                started_at = COALESCE(started_at, ${TODAY_SQL})
          WHERE id = $1 AND user_id = $2
          RETURNING *`,
        [gameId, userId],
      );
      await client.query(
        "DELETE FROM user_next_up_games WHERE user_id = $1 AND game_id = $2",
        [userId, gameId],
      );
      const gameIds = await compactQueue(client, userId);
      await client.query("COMMIT");

      const detailQuery = selectOwnedGameDetailsQuery(gameId, userId);
      const detail = await pool.query(detailQuery.text, detailQuery.values);
      res.json({
        game: decorateGameForClient(detail.rows[0] || updated.rows[0]),
        gameIds,
      });
    } catch (error) {
      try {
        await client?.query("ROLLBACK");
      } catch {}
      next(error);
    } finally {
      client?.release();
    }
  },
);

export default router;
