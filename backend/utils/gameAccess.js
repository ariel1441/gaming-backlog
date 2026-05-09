export function listOwnedGamesQuery(userId) {
  return {
    text: `
      SELECT g.*, s.rank AS status_rank
      FROM games g
      LEFT JOIN statuses s ON s.status = g.status
      WHERE g.user_id = $1
      ORDER BY s.rank NULLS LAST, g.position NULLS LAST, g.id
      `,
    values: [userId],
  };
}

export function listOwnedGameTitlesQuery(userId) {
  return {
    text: `SELECT id, name FROM games WHERE user_id = $1`,
    values: [userId],
  };
}

export function selectOwnedGameQuery(gameId, userId, fields = "*") {
  return {
    text: `SELECT ${fields} FROM games WHERE id = $1 AND user_id = $2`,
    values: [gameId, userId],
  };
}

export function deleteOwnedGameQuery(gameId, userId) {
  return {
    text: `DELETE FROM games WHERE id = $1 AND user_id = $2 RETURNING *`,
    values: [gameId, userId],
  };
}

export function updateOwnedGameStatusQuery(gameId, userId, status) {
  return {
    text: `UPDATE games SET status = $3 WHERE id = $1 AND user_id = $2`,
    values: [gameId, userId, status],
  };
}
