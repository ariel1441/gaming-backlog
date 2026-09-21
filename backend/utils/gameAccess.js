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
             cg.metadata_quality AS catalog_metadata_quality,
             ugs.provider_app_id AS steam_app_id,
             sic.steam_name AS steam_name,
             ugs.playtime_minutes_forever AS steam_playtime_minutes,
             ugs.last_played_at AS steam_last_played_at,
             ugs.first_play_observed_at AS steam_first_play_observed_at,
             ugs.first_play_observed_playtime_minutes AS steam_first_play_observed_playtime_minutes,
             ugs.last_synced_at AS steam_last_synced_at,
             ugs.achievements_unlocked AS steam_achievements_unlocked,
             ugs.achievements_total AS steam_achievements_total,
             ugs.achievements_percent AS steam_achievements_percent,
             ugs.achievements_status AS steam_achievements_status,
             ugs.achievements_last_synced_at AS steam_achievements_last_synced_at,
             ugs.achievements_last_error_code AS steam_achievements_last_error_code,
             ugs.achievements_last_error_message AS steam_achievements_last_error_message,
             (ugs.id IS NOT NULL AND ugs.source_status = 'owned') AS steam_owned,
             focus.focus_role,
             personal.personal_genres
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
      LEFT JOIN user_play_focus_games focus
        ON focus.user_id = g.user_id
       AND focus.game_id = g.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(json_build_object('id', genre.id, 'name', genre.name)
            ORDER BY membership.position),
          '[]'::json
        ) AS personal_genres
        FROM game_personal_genres membership
        JOIN user_personal_genres genre
          ON genre.id = membership.personal_genre_id
         AND genre.user_id = membership.user_id
        WHERE membership.game_id = g.id AND membership.user_id = g.user_id
      ) personal ON TRUE
      WHERE g.user_id = $1
        AND LOWER(TRIM(g.status)) <> 'wishlist'
      ORDER BY s.rank NULLS LAST, g.position NULLS LAST, g.id
      `,
    values: [userId],
  };
}

export function lookupOwnedGamesQuery(userId, { query = "", gameId = null, limit = 25 } = {}) {
  const params = [userId];
  const where = ["g.user_id = $1", "LOWER(TRIM(g.status)) <> 'wishlist'"];
  const id = Number(gameId);
  if (Number.isInteger(id) && id > 0) {
    params.push(id);
    where.push(`g.id = $${params.length}`);
  }
  const search = String(query || "").trim();
  if (search) {
    params.push(`%${search}%`);
    where.push(`g.name ILIKE $${params.length}`);
  }
  params.push(Math.min(Math.max(Number(limit) || 25, 1), 50));
  return {
    text: `SELECT g.id, g.user_id, g.name, g.status, g.started_at, g.finished_at
      FROM games g
      WHERE ${where.join(" AND ")}
      ORDER BY LOWER(g.name), g.id
      LIMIT $${params.length}`,
    values: params,
  };
}

export function listOwnedGamesPageQuery(userId, options = {}) {
  const params = [userId];
  const where = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const statuses = (Array.isArray(options.status) ? options.status : [options.status])
    .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  const genres = (Array.isArray(options.genre) ? options.genre : [options.genre])
    .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  const personalGenres = (Array.isArray(options.personalGenre) ? options.personalGenre : [options.personalGenre])
    .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  const estimateHoursSql = "COALESCE(NULLIF(backlog.how_long_to_beat, 0), NULLIF(backlog.catalog_rawg_playtime_hours, 0))";
  const listHoursSql = `(CASE
    WHEN ${estimateHoursSql} IS NOT NULL AND backlog.hours_preferred_source = 'estimate' THEN ${estimateHoursSql}
    WHEN COALESCE(backlog.steam_playtime_minutes, 0) > 0 AND (
      backlog.hours_preferred_source = 'steam_actual'
      OR (backlog.hours_preferred_source = 'auto' AND LOWER(TRIM(backlog.status)) IN ('finished', 'played alot but didnt finish'))
    ) THEN backlog.steam_playtime_minutes / 60.0
    WHEN ${estimateHoursSql} IS NOT NULL THEN ${estimateHoursSql}
    WHEN COALESCE(backlog.steam_playtime_minutes, 0) > 0 THEN backlog.steam_playtime_minutes / 60.0
    ELSE NULL
  END)`;

  if (options.query) {
    const query = add(`%${String(options.query).trim()}%`);
    where.push(`(backlog.name ILIKE ${query} OR backlog.catalog_name ILIKE ${query})`);
  }
  if (statuses.length) where.push(`LOWER(TRIM(backlog.status)) = ANY(${add(statuses)}::text[])`);
  if (genres.length || options.noGenre) {
    const genreParam = add(genres);
    where.push(`(
      (${Boolean(options.noGenre)} AND jsonb_array_length(COALESCE(backlog.catalog_genres_json, '[]'::jsonb)) = 0)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(backlog.catalog_genres_json, '[]'::jsonb)) genre
        WHERE LOWER(genre) = ANY(${genreParam}::text[]))
    )`);
  }
  if (personalGenres.length || options.noPersonalGenre) {
    const genreParam = add(personalGenres);
    where.push(`(
      (${Boolean(options.noPersonalGenre)} AND jsonb_array_length(COALESCE(backlog.personal_genres::jsonb, '[]'::jsonb)) = 0)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(backlog.personal_genres::jsonb, '[]'::jsonb)) genre
        WHERE LOWER(genre->>'name') = ANY(${genreParam}::text[]))
    )`);
  }
  if (options.minHours != null) where.push(`${listHoursSql} >= ${add(Number(options.minHours))}`);
  if (options.maxHours != null) where.push(`${listHoursSql} <= ${add(Number(options.maxHours))}`);
  if (options.missingEstimates) where.push(`${listHoursSql} IS NULL`);
  if (options.score != null) where.push(`backlog.my_score = ${add(Number(options.score))}`);
  if (options.ratedOnly) where.push("backlog.my_score IS NOT NULL");
  if (options.dateType === "startedYear") where.push(`EXTRACT(YEAR FROM backlog.started_at) = ${add(Number(options.dateYear))}`);
  if (options.dateType === "finishedYear") where.push(`EXTRACT(YEAR FROM backlog.finished_at) = ${add(Number(options.dateYear))}`);
  if (options.dateType === "touchedYear") {
    const year = add(Number(options.dateYear));
    where.push(`(EXTRACT(YEAR FROM backlog.started_at) = ${year} OR EXTRACT(YEAR FROM backlog.finished_at) = ${year})`);
  }
  if (options.dateType === "activeUnfinished") where.push("backlog.started_at IS NOT NULL AND backlog.finished_at IS NULL");
  if (options.dateType === "activeOlderThanMonths") {
    const months = Math.min(Math.max(Number(options.dateMonths) || 6, 1), 120);
    where.push(`backlog.started_at IS NOT NULL AND backlog.finished_at IS NULL
      AND backlog.started_at <= (now() AT TIME ZONE 'Asia/Jerusalem')::date - (${add(months)}::int * INTERVAL '1 month')`);
  }
  const sourceFilters = {
    steam_linked: "backlog.steam_app_id IS NOT NULL",
    steam_unlinked: "backlog.steam_app_id IS NULL",
    steam_playtime: "backlog.steam_app_id IS NOT NULL AND COALESCE(backlog.steam_playtime_minutes, 0) > 0",
    steam_no_playtime: "backlog.steam_app_id IS NOT NULL AND COALESCE(backlog.steam_playtime_minutes, 0) <= 0",
    steam_recent: "backlog.steam_app_id IS NOT NULL AND backlog.steam_last_played_at >= NOW() - INTERVAL '30 days'",
    steam_achievements: "backlog.steam_achievements_status = 'synced' AND COALESCE(backlog.steam_achievements_total, 0) > 0",
    steam_achievements_complete: "backlog.steam_achievements_status = 'synced' AND COALESCE(backlog.steam_achievements_percent, 0) >= 100",
    steam_achievements_close: "backlog.steam_achievements_status = 'synced' AND backlog.steam_achievements_percent >= 80 AND backlog.steam_achievements_percent < 100",
    steam_achievements_not_synced: "backlog.steam_app_id IS NOT NULL AND (backlog.steam_achievements_last_synced_at IS NULL OR COALESCE(backlog.steam_achievements_status, 'unknown') = 'unknown')",
    steam_achievements_unavailable: "backlog.steam_app_id IS NOT NULL AND backlog.steam_achievements_status IN ('private', 'unavailable', 'failed')",
  };
  if (sourceFilters[options.source]) where.push(sourceFilters[options.source]);
  if (options.rawgStatus === "linked") where.push("backlog.rawg_id IS NOT NULL AND (backlog.catalog_game_id IS NULL OR backlog.catalog_metadata_quality = 'full')");
  else if (options.rawgStatus === "incomplete") where.push("backlog.rawg_id IS NOT NULL AND backlog.catalog_game_id IS NOT NULL AND backlog.catalog_metadata_quality IS DISTINCT FROM 'full'");
  else if (options.rawgStatus === "missing") where.push("backlog.rawg_id IS NULL");
  else if (["pending", "review", "failed"].includes(options.rawgStatus)) where.push("FALSE");

  const direction = options.direction === "desc" ? "DESC" : "ASC";
  const optional = (expression) => `${expression} ${direction} NULLS LAST`;
  const sortMap = {
    name: `LOWER(backlog.name) ${direction}`,
    status: `backlog.status_rank ${direction} NULLS LAST, LOWER(backlog.status) ${direction}`,
    personal_genres: optional("backlog.my_genre"),
    estimated_hours: optional(estimateHoursSql),
    score: optional("backlog.my_score"),
    hours_played: optional("backlog.steam_playtime_minutes"),
    rawg_rating: optional("backlog.catalog_rawg_rating"),
    metacritic: optional("backlog.catalog_metacritic"),
    release_date: optional("backlog.catalog_released_at"),
    started_date: optional("backlog.started_at"),
    finished_date: optional("backlog.finished_at"),
    steam_last_played: optional("backlog.steam_last_played_at"),
  };
  const order = options.sort
    ? `${sortMap[options.sort] || sortMap.name}, backlog.status_rank ASC NULLS LAST, backlog.position ASC NULLS LAST, backlog.id ASC`
    : `backlog.status_rank ${direction} NULLS LAST, backlog.position ${direction} NULLS LAST, backlog.id ${direction}`;
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);
  params.push(limit, offset);
  const base = listOwnedGamesQuery(userId).text.replace(/\s+ORDER BY s\.rank NULLS LAST, g\.position NULLS LAST, g\.id\s*$/i, "");
  return {
    text: `WITH backlog AS (${base}), filtered AS (
      SELECT * FROM backlog${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
    ), revision AS (
      SELECT COUNT(*)::int AS total_count,
             MD5(COUNT(*)::text || ':' || COALESCE(SUM(hashtextextended(filtered::text, 0)), 0)::text) AS snapshot_version
        FROM filtered
    )
    SELECT backlog.*, revision.total_count, revision.snapshot_version
      FROM filtered backlog CROSS JOIN revision
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    values: params,
  };
}

export function ownedGamesFacetsQuery(userId) {
  const base = listOwnedGamesQuery(userId).text.replace(/\s+ORDER BY s\.rank NULLS LAST, g\.position NULLS LAST, g\.id\s*$/i, "");
  const estimateHoursSql = "COALESCE(NULLIF(backlog.how_long_to_beat, 0), NULLIF(backlog.catalog_rawg_playtime_hours, 0))";
  const listHoursSql = `(CASE
    WHEN ${estimateHoursSql} IS NOT NULL AND backlog.hours_preferred_source = 'estimate' THEN ${estimateHoursSql}
    WHEN COALESCE(backlog.steam_playtime_minutes, 0) > 0 AND (
      backlog.hours_preferred_source = 'steam_actual'
      OR (backlog.hours_preferred_source = 'auto' AND LOWER(TRIM(backlog.status)) IN ('finished', 'played alot but didnt finish'))
    ) THEN backlog.steam_playtime_minutes / 60.0
    WHEN ${estimateHoursSql} IS NOT NULL THEN ${estimateHoursSql}
    WHEN COALESCE(backlog.steam_playtime_minutes, 0) > 0 THEN backlog.steam_playtime_minutes / 60.0
    ELSE NULL
  END)`;
  return {
    text: `WITH backlog AS (${base})
      SELECT COUNT(*)::int AS collection_total,
             MD5(COUNT(*)::text || ':' || COALESCE(SUM(hashtextextended(backlog::text, 0)), 0)::text) AS snapshot_version,
             FLOOR(MIN(${listHoursSql}))::int AS min_hours,
             CEIL(MAX(${listHoursSql}))::int AS max_hours,
             COALESCE((SELECT jsonb_agg(DISTINCT genre.value ORDER BY genre.value)
               FROM backlog games, LATERAL jsonb_array_elements_text(COALESCE(games.catalog_genres_json, '[]'::jsonb)) genre(value)), '[]'::jsonb) AS genres
        FROM backlog`,
    values: [userId],
  };
}

export function selectOwnedGameDetailsQuery(gameId, userId) {
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
             cg.metadata_quality AS catalog_metadata_quality,
             ugs.provider_app_id AS steam_app_id,
             sic.steam_name AS steam_name,
             ugs.playtime_minutes_forever AS steam_playtime_minutes,
             ugs.last_played_at AS steam_last_played_at,
             ugs.first_play_observed_at AS steam_first_play_observed_at,
             ugs.first_play_observed_playtime_minutes AS steam_first_play_observed_playtime_minutes,
             ugs.last_synced_at AS steam_last_synced_at,
             ugs.achievements_unlocked AS steam_achievements_unlocked,
             ugs.achievements_total AS steam_achievements_total,
             ugs.achievements_percent AS steam_achievements_percent,
             ugs.achievements_status AS steam_achievements_status,
             ugs.achievements_last_synced_at AS steam_achievements_last_synced_at,
             ugs.achievements_last_error_code AS steam_achievements_last_error_code,
             ugs.achievements_last_error_message AS steam_achievements_last_error_message,
             (ugs.id IS NOT NULL AND ugs.source_status = 'owned') AS steam_owned,
             focus.focus_role,
             personal.personal_genres
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
      LEFT JOIN user_play_focus_games focus
        ON focus.user_id = g.user_id
       AND focus.game_id = g.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(json_build_object('id', genre.id, 'name', genre.name)
            ORDER BY membership.position),
          '[]'::json
        ) AS personal_genres
        FROM game_personal_genres membership
        JOIN user_personal_genres genre
          ON genre.id = membership.personal_genre_id
         AND genre.user_id = membership.user_id
        WHERE membership.game_id = g.id AND membership.user_id = g.user_id
      ) personal ON TRUE
      WHERE g.id = $1 AND g.user_id = $2
      LIMIT 1
      `,
    values: [gameId, userId],
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

export function updateOwnedGameStatusQuery(
  gameId,
  userId,
  status,
  removeNextUp = false,
  removePlayFocus = false,
) {
  return {
    text: `
      WITH updated AS (
        UPDATE games
           SET status = $3
         WHERE id = $1 AND user_id = $2
         RETURNING *
      ),
      removed AS (
        DELETE FROM user_next_up_games
         WHERE user_id = $2 AND game_id = $1 AND $4
         RETURNING game_id
      ),
      unfocused AS (
        DELETE FROM user_play_focus_games
         WHERE user_id = $2 AND game_id = $1 AND $5
         RETURNING game_id
      )
      SELECT * FROM updated
    `,
    values: [gameId, userId, status, removeNextUp, removePlayFocus],
  };
}
