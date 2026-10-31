import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import {
  addNextUpCandidate,
  assignPlayFocus,
  nextUpGameId,
  reorderNextUp,
} from "../validators/nextUp.js";
import { isNextUpEligible, statusGroupOf } from "../utils/status.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { selectOwnedGameDetailsQuery } from "../utils/gameAccess.js";
import { decorateGameForClient } from "./games.js";
import { cacheClear } from "../utils/microCache.js";

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

async function lockedQueueRows(client, userId, role) {
  const result = await client.query(
    `SELECT n.game_id, n.position, n.candidate_role
       FROM user_next_up_games n
       JOIN games g ON g.id = n.game_id AND g.user_id = n.user_id
       WHERE n.user_id = $1
        AND n.candidate_role = $2
        AND LOWER(TRIM(g.status)) NOT IN ('wishlist', 'playing', 'finished', 'played alot but didnt finish', 'played a lot but didn''t finish', 'occasional', 'played and wont come back', 'not anytime soon', 'recommended by someone')
      ORDER BY n.position, n.game_id
      FOR UPDATE OF n`,
    [userId, role],
  );
  return result.rows;
}

async function compactQueue(client, userId, role, rows = null) {
  const ordered = rows || (await lockedQueueRows(client, userId, role));
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
        WHERE n.user_id = $3 AND n.candidate_role = $4 AND n.game_id = v.game_id`,
      [ids, positions, userId, role],
    );
  }
  return ordered.map((row) => Number(row.game_id));
}

function candidatePayload(rows = []) {
  const candidates = { main: [], side: [] };
  rows.forEach((row) => {
    if (candidates[row.candidate_role]) {
      candidates[row.candidate_role].push(Number(row.game_id));
    }
  });
  return candidates;
}

async function readCandidates(queryable, userId) {
  const result = await queryable.query(
    `SELECT n.game_id, n.position, n.candidate_role, n.added_at
       FROM user_next_up_games n
       JOIN games g ON g.id = n.game_id AND g.user_id = n.user_id
      WHERE n.user_id = $1
        AND LOWER(TRIM(g.status)) NOT IN ('wishlist', 'playing', 'finished', 'played alot but didnt finish', 'played a lot but didn''t finish', 'occasional', 'played and wont come back', 'not anytime soon', 'recommended by someone')
      ORDER BY CASE n.candidate_role WHEN 'main' THEN 0 ELSE 1 END,
               n.position, n.game_id`,
    [userId],
  );
  return result.rows;
}

function candidateResponse(rows) {
  const candidates = candidatePayload(rows);
  return {
    gameIds: [...candidates.main, ...candidates.side],
    candidates,
    queue: rows.map((row) => ({
      gameId: Number(row.game_id),
      position: Number(row.position),
      role: row.candidate_role,
      addedAt: row.added_at,
    })),
  };
}

function focusPayload(rows = []) {
  const result = { main: null, side: null, occasional: [] };
  rows.forEach((row) => {
    const gameId = Number(row.game_id);
    if (row.focus_role === "occasional") result.occasional.push(gameId);
    else if (row.focus_role === "main" || row.focus_role === "side") {
      result[row.focus_role] = gameId;
    }
  });
  return result;
}

async function readFocus(queryable, userId) {
  const result = await queryable.query(
    `SELECT focus.game_id, CASE WHEN LOWER(TRIM(g.status)) = 'occasional' THEN 'occasional' ELSE focus.focus_role END AS focus_role, focus.assigned_at
       FROM user_play_focus_games focus
       JOIN games g ON g.id = focus.game_id AND g.user_id = focus.user_id
      WHERE focus.user_id = $1
        AND LOWER(TRIM(g.status)) <> 'wishlist'
      UNION ALL
      SELECT g.id AS game_id, 'occasional' AS focus_role, NULL AS assigned_at
        FROM games g
       WHERE g.user_id = $1 AND LOWER(TRIM(g.status)) = 'occasional'
         AND NOT EXISTS (SELECT 1 FROM user_play_focus_games f WHERE f.user_id = $1 AND f.game_id = g.id)
      ORDER BY assigned_at NULLS LAST, game_id`,
    [userId],
  );
  return focusPayload(result.rows);
}

router.get("/", verifyToken, async (req, res, next) => {
  try {
    const [result, focus] = await Promise.all([
      readCandidates(pool, req.user.id),
      readFocus(pool, req.user.id),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ...candidateResponse(result),
      focus,
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  "/focus/:role",
  verifyToken,
  assignPlayFocus,
  async (req, res, next) => {
    let client;
    try {
      const userId = req.user.id;
      const gameId = Number(req.body.gameId);
      const role = req.params.role;
      client = await pool.connect();
      await client.query("BEGIN");
      await lockQueue(client, userId);

      const gameResult = await client.query(
        "SELECT id, status FROM games WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [gameId, userId],
      );
      const game = gameResult.rows[0];
      if (!game) throw notFound("Game not found");
      const normalized = String(game.status || "")
        .trim()
        .toLowerCase();
      if (normalized === "wishlist" || statusGroupOf(game.status) === "done") {
        throw badRequest("Finished and wishlist games cannot be focused.");
      }
      if (role === "occasional" && !["playing", "occasional"].includes(statusGroupOf(game.status))) {
        throw badRequest("Only Playing or Occasional games can be marked occasional.");
      }

      if (role === "occasional") {
        await client.query("UPDATE games SET status = 'occasional' WHERE id = $1 AND user_id = $2", [gameId, userId]);
      } else if (statusGroupOf(game.status) === "occasional") {
        await client.query(`UPDATE games SET status = 'playing', started_at = COALESCE(started_at, ${TODAY_SQL}) WHERE id = $1 AND user_id = $2`, [gameId, userId]);
      } else if (!isNextUpEligible(game.status) && statusGroupOf(game.status) !== "playing") {
        throw badRequest("Change this game to Playing before assigning a focus slot.");
      }
      await client.query(
        `DELETE FROM user_play_focus_games
          WHERE user_id = $1
            AND (game_id = $2 OR ($3 IN ('main', 'side') AND focus_role = $3))`,
        [userId, gameId, role],
      );
      await client.query(
        `INSERT INTO user_play_focus_games (user_id, game_id, focus_role)
         VALUES ($1, $2, $3)`,
        [userId, gameId, role],
      );
      if (game.status === "occasional" && role !== "occasional") {
        await client.query("DELETE FROM user_play_focus_games WHERE user_id = $1 AND game_id = $2 AND focus_role = 'occasional'", [userId, gameId]);
      }
      const removedCandidate = await client.query(
        `DELETE FROM user_next_up_games
          WHERE user_id = $1 AND game_id = $2
          RETURNING candidate_role`,
        [userId, gameId],
      );
      if (removedCandidate.rows[0]?.candidate_role) {
        await compactQueue(client, userId, removedCandidate.rows[0].candidate_role);
      }
      const candidateState = candidateResponse(await readCandidates(client, userId));
      const focus = await readFocus(client, userId);
      await client.query("COMMIT");
      cacheClear(userId);
      const detailQuery = selectOwnedGameDetailsQuery(gameId, userId);
      const detail = await pool.query(detailQuery.text, detailQuery.values);
      res.json({ focus, ...candidateState, game: detail.rows[0] ? decorateGameForClient(detail.rows[0]) : undefined });
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

router.delete(
  "/focus/:gameId",
  verifyToken,
  nextUpGameId,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const gameId = Number(req.params.gameId);
      const removed = await pool.query(
        `WITH removed AS (
          DELETE FROM user_play_focus_games WHERE user_id = $1 AND game_id = $2 RETURNING game_id
        ), updated AS (
          UPDATE games SET status = 'playing' WHERE user_id = $1 AND id = $2 AND status = 'occasional' RETURNING id AS game_id
        ) SELECT game_id FROM removed UNION SELECT game_id FROM updated`,
        [userId, gameId],
      );
      if (!removed.rows[0]) throw notFound("Game is not focused.");
      cacheClear(userId);
      const detailQuery = selectOwnedGameDetailsQuery(gameId, userId);
      const detail = await pool.query(detailQuery.text, detailQuery.values);
      res.json({ gameId, focus: await readFocus(pool, userId), game: detail.rows[0] ? decorateGameForClient(detail.rows[0]) : undefined });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/:gameId", verifyToken, nextUpGameId, addNextUpCandidate, async (req, res, next) => {
  let client;
  try {
    const userId = req.user.id;
    const gameId = Number(req.params.gameId);
    const role = req.body?.role || "main";
    client = await pool.connect();
    await client.query("BEGIN");
    await lockQueue(client, userId);
    const gameResult = await client.query(
      "SELECT id, status FROM games WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [gameId, userId],
    );
    const game = gameResult.rows[0];
    if (!game) throw notFound("Game not found");
    if (
      String(game.status || "")
        .trim()
        .toLowerCase() === "wishlist"
    ) {
      throw badRequest("Move this wishlist item into the backlog first.");
    }
    if (!isNextUpEligible(game.status)) {
      throw badRequest("Choose a planned, on-hold or played-a-bit game for Next Up.");
    }
    const existing = await client.query(
      "SELECT candidate_role FROM user_next_up_games WHERE user_id = $1 AND game_id = $2",
      [userId, gameId],
    );
    if (existing.rows[0]?.candidate_role === role) {
      throw conflict(`Game is already in your ${role} candidates.`);
    }
    if (existing.rows[0]) {
      await client.query(
        "DELETE FROM user_next_up_games WHERE user_id = $1 AND game_id = $2",
        [userId, gameId],
      );
      await compactQueue(client, userId, existing.rows[0].candidate_role);
    }
    const queue = await lockedQueueRows(client, userId, role);
    const maxPosition = queue.reduce(
      (max, row) => Math.max(max, Number(row.position) || 0),
      -POSITION_SPACING,
    );
    const position = maxPosition + POSITION_SPACING;
    await client.query(
      `INSERT INTO user_next_up_games (user_id, game_id, candidate_role, position)
       VALUES ($1, $2, $3, $4)`,
      [userId, gameId, role, position],
    );
    const state = candidateResponse(await readCandidates(client, userId));
    await client.query("COMMIT");
    res.status(existing.rows[0] ? 200 : 201).json({
      gameId,
      role,
      position: queue.length,
      ...state,
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
        RETURNING game_id, candidate_role`,
      [userId, gameId],
    );
    if (!removed.rows[0]) throw notFound("Game is not in Next Up.");
    await compactQueue(client, userId, removed.rows[0].candidate_role);
    const state = candidateResponse(await readCandidates(client, userId));
    await client.query("COMMIT");
    res.json({ gameId, ...state });
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
    const role = req.body?.role || "main";
    client = await pool.connect();
    await client.query("BEGIN");
    await lockQueue(client, userId);
    const current = await lockedQueueRows(client, userId, role);
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
      role,
      gameIds.map((gameId) => ({ game_id: gameId })),
    );
    const state = candidateResponse(await readCandidates(client, userId));
    await client.query("COMMIT");
    res.json({ ...state, reorderedRole: role });
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
          WHERE g.id = $1 AND g.user_id = $2
          FOR UPDATE OF g`,
        [gameId, userId],
      );
      const game = gameResult.rows[0];
      if (!game) throw notFound("Game not found.");
      const normalized = String(game.status || "")
        .trim()
        .toLowerCase();
      if (normalized === "wishlist" || statusGroupOf(game.status) === "done") {
        throw badRequest("Finished and wishlist games cannot be started here.");
      }
      const updated = await client.query(
        `UPDATE games
            SET status = 'playing',
                started_at = COALESCE(started_at, ${TODAY_SQL})
          WHERE id = $1 AND user_id = $2
          RETURNING *`,
        [gameId, userId],
      );
      if (game.status === "occasional") {
        await client.query("DELETE FROM user_play_focus_games WHERE user_id = $1 AND game_id = $2 AND focus_role = 'occasional'", [userId, gameId]);
      }
      const removedCandidate = await client.query(
        `DELETE FROM user_next_up_games
          WHERE user_id = $1 AND game_id = $2
          RETURNING candidate_role`,
        [userId, gameId],
      );
      if (removedCandidate.rows[0]?.candidate_role) {
        await compactQueue(client, userId, removedCandidate.rows[0].candidate_role);
      }
      const candidateState = candidateResponse(await readCandidates(client, userId));
      await client.query("COMMIT");
      cacheClear(userId);

      const detailQuery = selectOwnedGameDetailsQuery(gameId, userId);
      const detail = await pool.query(detailQuery.text, detailQuery.values);
      res.json({
        game: decorateGameForClient(detail.rows[0] || updated.rows[0]),
        ...candidateState,
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
