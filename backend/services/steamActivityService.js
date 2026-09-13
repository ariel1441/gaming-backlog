import { pool } from "../db.js";

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function nullableNonNegativeInteger(value) {
  return value == null || !Number.isFinite(Number(value))
    ? null
    : Math.max(0, Math.trunc(Number(value)));
}

export async function recordSteamActivityObservations(
  { userId, syncRunId },
  client = pool,
) {
  if (!syncRunId) return { recorded: 0, baselines: 0 };
  const { rows } = await client.query(
    `WITH sources AS (
      SELECT source.id AS source_id, source.user_id, source.game_id,
        source.catalog_game_id, source.provider_app_id AS steam_app_id,
        source.playtime_minutes_forever, source.achievements_unlocked,
        source.achievements_total, game.name AS game_name, game.cover AS game_cover,
        catalog.name AS catalog_name, catalog.cover_url AS catalog_cover,
        candidate.steam_name, candidate.steam_icon_url,
        current_job.account_id, current_job.provider_user_id, account.linked_at
      FROM user_game_sources source
      JOIN steam_sync_jobs current_job ON current_job.sync_run_id = $2
        AND current_job.user_id = source.user_id
      JOIN user_external_accounts account ON account.id = current_job.account_id
        AND account.user_id = source.user_id AND account.disconnected_at IS NULL
        AND account.provider_user_id = current_job.provider_user_id
      LEFT JOIN games game ON game.id = source.game_id AND game.user_id = source.user_id
      LEFT JOIN catalog_games catalog ON catalog.id = source.catalog_game_id
      LEFT JOIN LATERAL (
        SELECT steam_name, steam_icon_url FROM steam_import_candidates
        WHERE user_id = source.user_id AND steam_app_id = source.provider_app_id
        LIMIT 1
      ) candidate ON TRUE
      WHERE source.user_id = $1 AND source.provider = 'steam'
        AND source.source_status IN ('owned', 'ignored')
    ), inserted AS (
      INSERT INTO steam_activity_observations (
        user_id, sync_run_id, source_id, game_id, catalog_game_id, steam_app_id,
        game_name, cover_url, playtime_minutes_forever, playtime_delta_minutes,
        achievements_unlocked, achievements_total, achievements_delta,
        interval_started_at, observed_at, is_baseline
      )
      SELECT s.user_id, $2, s.source_id, s.game_id, s.catalog_game_id, s.steam_app_id,
        COALESCE(s.game_name, s.catalog_name, s.steam_name, 'Steam game'),
        COALESCE(s.game_cover, s.catalog_cover, s.steam_icon_url),
        GREATEST(COALESCE(s.playtime_minutes_forever, 0), 0),
        CASE WHEN previous.id IS NULL THEN 0
          ELSE GREATEST(COALESCE(s.playtime_minutes_forever, 0) - previous.playtime_minutes_forever, 0) END,
        s.achievements_unlocked, s.achievements_total,
        CASE WHEN previous.id IS NULL OR s.achievements_unlocked IS NULL
                    OR previous.achievements_unlocked IS NULL THEN 0
          ELSE GREATEST(s.achievements_unlocked - previous.achievements_unlocked, 0) END,
        previous.observed_at, NOW(), previous.id IS NULL
      FROM sources s
      LEFT JOIN LATERAL (
        SELECT observation.id, observation.observed_at,
          observation.playtime_minutes_forever, observation.achievements_unlocked
        FROM steam_activity_observations observation
        JOIN steam_sync_jobs previous_job ON previous_job.sync_run_id = observation.sync_run_id
          AND previous_job.user_id = observation.user_id
        WHERE observation.user_id = s.user_id AND observation.steam_app_id = s.steam_app_id
          AND previous_job.account_id = s.account_id
          AND previous_job.provider_user_id = s.provider_user_id
          AND observation.observed_at >= s.linked_at
          AND observation.sync_run_id <> $2
        ORDER BY observation.observed_at DESC, observation.id DESC LIMIT 1
      ) previous ON TRUE
      ON CONFLICT (sync_run_id, steam_app_id) DO NOTHING
      RETURNING *
    )
    SELECT * FROM inserted`,
    [userId, syncRunId],
  );
  return {
    recorded: rows.length,
    baselines: rows.filter((row) => row.is_baseline).length,
    activityChanged: rows.filter(
      (row) => nonNegativeInteger(row.playtime_delta_minutes) > 0 ||
        nonNegativeInteger(row.achievements_delta) > 0,
    ).length,
  };
}

export function groupSteamActivityHistory(rows = [], timezone = "Asia/Jerusalem") {
  const dayMap = new Map();
  for (const row of rows) {
    const observedAt = row.observed_at || row.observedAt;
    const localDay = row.local_day || new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(observedAt));
    const day = String(localDay);
    const current = dayMap.get(day) || {
      date: day, playtimeMinutes: 0, achievementsUnlocked: 0, hasGap: false, games: [],
    };
    const intervalStartedAt = row.interval_started_at || row.intervalStartedAt || null;
    const gap = intervalStartedAt &&
      new Date(observedAt).getTime() - new Date(intervalStartedAt).getTime() > 36 * 60 * 60 * 1000;
    const entry = {
      id: Number(row.id), gameId: row.game_id == null ? null : Number(row.game_id),
      catalogGameId: row.catalog_game_id == null ? null : Number(row.catalog_game_id),
      steamAppId: row.steam_app_id, name: row.game_name, cover: row.cover_url || null,
      playtimeMinutes: nonNegativeInteger(row.playtime_delta_minutes),
      achievementsUnlocked: nonNegativeInteger(row.achievements_delta),
      achievementsTotal: nullableNonNegativeInteger(row.achievements_total),
      achievementsCurrent: nullableNonNegativeInteger(row.achievements_unlocked),
      intervalStartedAt, observedAt, hasGap: Boolean(gap), isBacklogGame: row.game_id != null,
    };
    current.playtimeMinutes += entry.playtimeMinutes;
    current.achievementsUnlocked += entry.achievementsUnlocked;
    current.hasGap ||= entry.hasGap;
    current.games.push(entry);
    dayMap.set(day, current);
  }
  const days = [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { timezone, days, summary: {
    playtimeMinutes: days.reduce((total, day) => total + day.playtimeMinutes, 0),
    achievementsUnlocked: days.reduce((total, day) => total + day.achievementsUnlocked, 0),
    activeDays: days.length,
  }};
}

export async function listSteamActivityHistory(userId, { days = 35, timezone = "Asia/Jerusalem" } = {}) {
  const safeDays = Math.min(Math.max(Number(days) || 35, 7), 180);
  const { rows } = await pool.query(
    `SELECT id, game_id, catalog_game_id, steam_app_id, game_name, cover_url,
      playtime_minutes_forever, playtime_delta_minutes, achievements_unlocked,
      achievements_total, achievements_delta, interval_started_at, observed_at,
      is_baseline, (observed_at AT TIME ZONE $2)::date AS local_day
     FROM steam_activity_observations
     WHERE user_id = $1 AND observed_at >= NOW() - ($3::int * INTERVAL '1 day')
       AND (playtime_delta_minutes > 0 OR achievements_delta > 0)
     ORDER BY observed_at DESC, id DESC`,
    [userId, timezone, safeDays],
  );
  return groupSteamActivityHistory(rows, timezone);
}
