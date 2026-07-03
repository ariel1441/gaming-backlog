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
             cg.tags_json AS catalog_tags_json,
             ugs.provider_app_id AS steam_app_id,
             sic.steam_name AS steam_name,
             ugs.playtime_minutes_forever AS steam_playtime_minutes,
             ugs.last_played_at AS steam_last_played_at,
             ugs.last_synced_at AS steam_last_synced_at,
             ugs.achievements_unlocked AS steam_achievements_unlocked,
             ugs.achievements_total AS steam_achievements_total,
             ugs.achievements_percent AS steam_achievements_percent,
             ugs.achievements_status AS steam_achievements_status,
             ugs.achievements_last_synced_at AS steam_achievements_last_synced_at,
             ugs.achievements_last_error_code AS steam_achievements_last_error_code,
             ugs.achievements_last_error_message AS steam_achievements_last_error_message,
             (ugs.id IS NOT NULL AND ugs.source_status = 'owned') AS steam_owned
      FROM games g
      LEFT JOIN statuses s ON s.status = g.status
      LEFT JOIN catalog_games cg ON cg.id = g.catalog_game_id
      LEFT JOIN LATERAL (
        SELECT source.*
        FROM user_game_sources source
        WHERE source.game_id = g.id
          AND source.user_id = g.user_id
          AND source.provider = 'steam'
          AND source.source_status = 'owned'
        ORDER BY
          (source.playtime_minutes_forever IS NOT NULL AND source.playtime_minutes_forever > 0) DESC,
          source.last_synced_at DESC NULLS LAST,
          source.id DESC
        LIMIT 1
      ) ugs ON TRUE
      LEFT JOIN steam_import_candidates sic
        ON sic.user_id = g.user_id
       AND sic.steam_app_id = ugs.provider_app_id
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
