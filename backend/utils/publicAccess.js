export function listPublicGamesQuery(userId) {
  return {
    text: `
      SELECT g.id,
             g.name,
             g.status,
             g.position,
             g.my_genre,
             g.how_long_to_beat,
             g.cover,
             g.favorite_rank,
             g.started_at,
             g.finished_at,
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
             cg.metadata_quality AS catalog_metadata_quality,
             personal.personal_genres
      FROM games g
      LEFT JOIN statuses s ON g.status = s.status
      LEFT JOIN catalog_games cg ON cg.id = g.catalog_game_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(json_build_object('name', genre.name) ORDER BY membership.position),
          '[]'::json
        ) AS personal_genres
        FROM game_personal_genres membership
        JOIN user_personal_genres genre
          ON genre.id = membership.personal_genre_id
         AND genre.user_id = membership.user_id
        WHERE membership.game_id = g.id AND membership.user_id = g.user_id
      ) personal ON TRUE
      WHERE g.user_id = $1
      ORDER BY s.rank ASC, g.position ASC NULLS LAST, g.id ASC
      `,
    values: [userId],
  };
}
