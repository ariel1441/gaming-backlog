export function listOwnedGamesQuery(userId) {
  return {
    text: `
      SELECT g.*,
             s.rank AS status_rank,
             cg.name AS catalog_name,
             cg.cover_url AS catalog_cover_url,
             cg.released_at AS catalog_released_at,
             cg.description_html AS catalog_description_html,
             cg.rawg_rating AS catalog_rawg_rating,
             cg.metacritic AS catalog_metacritic,
             cg.rawg_playtime_hours AS catalog_rawg_playtime_hours,
             cg.genres_json AS catalog_genres_json,
             cg.stores_json AS catalog_stores_json,
             cg.tags_json AS catalog_tags_json
      FROM games g
      LEFT JOIN statuses s ON s.status = g.status
      LEFT JOIN catalog_games cg ON cg.id = g.catalog_game_id
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
