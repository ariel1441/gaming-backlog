import { pool } from "../db.js";
import { createFactualActivityEvent } from "./activityEventService.js";
import { gamingActivityDay } from "../utils/gamingActivityDay.js";

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

export async function recordSteamActivityObservations(
  { userId, syncRunId, snapshotObservedAt },
  client = pool,
) {
  if (!syncRunId) return { recorded: 0, baselines: 0 };
  const snapshotTime = new Date(snapshotObservedAt);
  if (!snapshotObservedAt || !Number.isFinite(snapshotTime.getTime())) {
    throw new Error("A valid Steam snapshot observation time is required.");
  }
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
    ), account_previous AS (
      SELECT observation.observed_at, observation.observation_time_source
      FROM steam_activity_observations observation
      JOIN steam_sync_jobs previous_job ON previous_job.sync_run_id = observation.sync_run_id
        AND previous_job.user_id = observation.user_id
      JOIN (SELECT DISTINCT user_id, account_id, provider_user_id, linked_at FROM sources) context
        ON context.user_id = observation.user_id
        AND context.account_id = previous_job.account_id
        AND context.provider_user_id = previous_job.provider_user_id
      WHERE observation.observed_at >= context.linked_at
        AND observation.sync_run_id <> $2
      ORDER BY observation.observed_at DESC, observation.id DESC
      LIMIT 1
    ), inserted AS (
      INSERT INTO steam_activity_observations (
        user_id, sync_run_id, source_id, game_id, catalog_game_id, steam_app_id,
        game_name, cover_url, playtime_minutes_forever, playtime_delta_minutes,
        achievements_unlocked, achievements_total, achievements_delta,
        interval_started_at, observed_at, observation_time_source,
        activity_precision, activity_day, counter_rebaseline, is_baseline
      )
      SELECT s.user_id, $2, s.source_id, s.game_id, s.catalog_game_id, s.steam_app_id,
        COALESCE(s.game_name, s.catalog_name, s.steam_name, 'Steam game'),
        COALESCE(s.game_cover, s.catalog_cover, s.steam_icon_url),
        GREATEST(COALESCE(s.playtime_minutes_forever, 0), 0),
        CASE
          WHEN previous.id IS NOT NULL
            THEN GREATEST(COALESCE(s.playtime_minutes_forever, 0) - previous.playtime_minutes_forever, 0)
          WHEN boundary.observed_at IS NOT NULL
            THEN GREATEST(COALESCE(s.playtime_minutes_forever, 0), 0)
          ELSE 0
        END,
        s.achievements_unlocked, s.achievements_total,
        CASE WHEN previous.id IS NULL OR s.achievements_unlocked IS NULL
                    OR previous.achievements_unlocked IS NULL THEN 0
          ELSE GREATEST(s.achievements_unlocked - previous.achievements_unlocked, 0) END,
        boundary.observed_at, $3::timestamptz, 'snapshot',
        CASE
          WHEN boundary.observed_at IS NULL THEN 'baseline'
          WHEN boundary.observation_time_source = 'snapshot'
            AND gaming_activity_day($3::timestamptz) - gaming_activity_day(boundary.observed_at) BETWEEN 0 AND 1
            THEN 'daily'
          ELSE 'uncertain'
        END,
        CASE
          WHEN boundary.observation_time_source = 'snapshot'
            AND gaming_activity_day($3::timestamptz) = gaming_activity_day(boundary.observed_at)
            THEN gaming_activity_day($3::timestamptz)
          WHEN boundary.observation_time_source = 'snapshot'
            AND gaming_activity_day($3::timestamptz) = gaming_activity_day(boundary.observed_at) + 1
            THEN gaming_activity_day(boundary.observed_at)
          ELSE NULL
        END,
        previous.id IS NOT NULL
          AND COALESCE(s.playtime_minutes_forever, 0) < previous.playtime_minutes_forever,
        boundary.observed_at IS NULL
      FROM sources s
      LEFT JOIN LATERAL (
        SELECT observation.id, observation.observed_at,
          observation.observation_time_source,
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
      LEFT JOIN account_previous ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(previous.observed_at, account_previous.observed_at) AS observed_at,
          COALESCE(previous.observation_time_source, account_previous.observation_time_source) AS observation_time_source
        WHERE previous.id IS NOT NULL OR account_previous.observed_at IS NOT NULL
      ) boundary ON TRUE
      ON CONFLICT (sync_run_id, steam_app_id) DO NOTHING
      RETURNING *
    )
    SELECT inserted.*, current_job.account_id,
      source.ownership_observed_run_id = $2 AS added_to_library,
      source.first_play_observed_at = inserted.observed_at AS first_played,
      previous_positive.activity_day AS previous_positive_activity_day,
      previous_positive.activity_precision AS previous_positive_precision
    FROM inserted
    JOIN steam_sync_jobs current_job ON current_job.sync_run_id = inserted.sync_run_id
      AND current_job.user_id = inserted.user_id
    LEFT JOIN user_game_sources source ON source.id = inserted.source_id
      AND source.user_id = inserted.user_id
    LEFT JOIN LATERAL (
      SELECT prior.activity_day, prior.activity_precision
      FROM steam_activity_observations prior
      JOIN steam_sync_jobs prior_job ON prior_job.sync_run_id = prior.sync_run_id
        AND prior_job.user_id = prior.user_id
      WHERE prior.user_id = inserted.user_id
        AND prior.steam_app_id = inserted.steam_app_id
        AND prior.id <> inserted.id
        AND prior.playtime_delta_minutes > 0
        AND prior_job.account_id = current_job.account_id
        AND prior_job.provider_user_id = current_job.provider_user_id
        AND prior.observed_at < inserted.observed_at
      ORDER BY prior.observed_at DESC, prior.id DESC
      LIMIT 1
    ) previous_positive ON TRUE`,
    [userId, syncRunId, snapshotTime.toISOString()],
  );
  if (rows.length) {
    await client.query(
      `UPDATE user_game_sources source
       SET first_play_activity_day = observation.activity_day
       FROM steam_activity_observations observation
       WHERE observation.sync_run_id = $1
         AND observation.source_id = source.id
         AND observation.activity_precision = 'daily'
         AND source.first_play_observed_at = observation.observed_at
         AND source.first_play_activity_day IS NULL`,
      [syncRunId],
    );
    await client.query(
      `UPDATE user_activity_events event
       SET payload_json = jsonb_set(
         jsonb_set(event.payload_json, '{activityDay}', to_jsonb(source.first_play_activity_day::text), TRUE),
         '{activityPrecision}', to_jsonb('daily'::text), TRUE
       )
       FROM user_game_sources source
       WHERE event.sync_run_id = $1
         AND event.user_id = source.user_id
         AND event.source = 'steam_library'
         AND event.external_id = source.provider_app_id
         AND event.event_type IN ('steam_started_playing', 'steam_status_suggestion')
         AND source.first_play_activity_day IS NOT NULL`,
      [syncRunId],
    );
    for (const row of rows) {
      const activityDay = dateOnly(row.activity_day);
      const intervalStartedAt = row.interval_started_at || null;
      const precision = row.activity_precision;
      const intervalKey = activityDay || (intervalStartedAt
        ? `${new Date(intervalStartedAt).toISOString()}:${new Date(row.observed_at).toISOString()}`
        : `baseline:${row.id}`);
      const groupKey = `steam-activity:${row.account_id}:${row.steam_app_id}:${intervalKey}`;
      const common = {
        activityDay,
        activityPrecision: precision,
        intervalStartedAt,
        intervalEndedAt: row.observed_at,
        groupKey,
      };
      if (nonNegativeInteger(row.playtime_delta_minutes) > 0) {
        await createFactualActivityEvent({
          userId, source: "steam_library", eventType: "steam_played",
          gameId: row.game_id, catalogGameId: row.catalog_game_id,
          externalId: row.steam_app_id, syncRunId,
          occurrenceKey: `play:${row.account_id}:${row.id}`,
          payload: { ...common, playtimeMinutes: nonNegativeInteger(row.playtime_delta_minutes) },
          observedAt: row.observed_at,
        }, client);
      }
      if (row.added_to_library) {
        await createFactualActivityEvent({
          userId, source: "steam_library", eventType: "steam_added_to_library",
          gameId: row.game_id, catalogGameId: row.catalog_game_id,
          externalId: row.steam_app_id, syncRunId,
          occurrenceKey: `library-added:${row.account_id}:${row.steam_app_id}`,
          payload: common, observedAt: row.observed_at,
        }, client);
      }
      if (row.first_played && !row.is_baseline) {
        await createFactualActivityEvent({
          userId, source: "steam_library", eventType: "steam_first_played",
          gameId: row.game_id, catalogGameId: row.catalog_game_id,
          externalId: row.steam_app_id, syncRunId,
          occurrenceKey: `first-play-fact:${row.account_id}:${row.steam_app_id}`,
          payload: common, observedAt: row.observed_at,
        }, client);
      }
      if (activityDay && precision === "daily" && row.previous_positive_precision === "daily" &&
          dateOnly(row.previous_positive_activity_day) && nonNegativeInteger(row.playtime_delta_minutes) > 0 &&
          !row.first_played) {
        const previousActivityDay = dateOnly(row.previous_positive_activity_day);
        const daysSincePrevious = Math.round(
          (Date.parse(`${activityDay}T00:00:00Z`) -
            Date.parse(`${previousActivityDay}T00:00:00Z`)) / 86_400_000,
        );
        if (daysSincePrevious >= 2) {
          await createFactualActivityEvent({
            userId, source: "steam_library", eventType: "steam_returned",
            gameId: row.game_id, catalogGameId: row.catalog_game_id,
            externalId: row.steam_app_id, syncRunId,
            occurrenceKey: `return:${row.account_id}:${row.id}`,
            payload: { ...common, daysSincePrevious }, observedAt: row.observed_at,
          }, client);
        }
      }
      await client.query(
        `UPDATE user_activity_events event
         SET payload_json = event.payload_json || $4::jsonb
         WHERE event.sync_run_id = $1 AND event.user_id = $2
           AND event.source = 'steam_library' AND event.external_id = $3
           AND event.event_kind = 'decision'`,
        [syncRunId, userId, row.steam_app_id, JSON.stringify({
          ...common,
          activityDay: row.first_played && !row.is_baseline ? activityDay : null,
          addedToLibrary: Boolean(row.added_to_library),
          firstPlayed: Boolean(row.first_played && !row.is_baseline),
        })],
      );
    }
  }
  return {
    recorded: rows.length,
    baselines: rows.filter((row) => row.is_baseline).length,
    daily: rows.filter((row) => row.activity_precision === "daily").length,
    uncertain: rows.filter((row) => row.activity_precision === "uncertain").length,
    counterRebaselines: rows.filter((row) => row.counter_rebaseline).length,
    activityChanged: rows.filter(
      (row) => nonNegativeInteger(row.playtime_delta_minutes) > 0 ||
        nonNegativeInteger(row.achievements_delta) > 0,
    ).length,
  };
}

function dayOrdinal(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? Math.trunc(Date.UTC(year, month - 1, day) / 86_400_000)
    : null;
}

function dayFromOrdinal(value) {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

function rangeStartFor(range, today) {
  if (range === "all") return null;
  return dayFromOrdinal(dayOrdinal(today) - (range === "30d" ? 29 : 6));
}

function addDays(day, amount) {
  return dayFromOrdinal(dayOrdinal(day) + amount);
}

function summarizeCoverage(coverageRows, {
  startDay = null, endDay = null, targetBoundaryDay = null,
} = {}) {
  const reliableDays = new Set();
  const uncertainKeys = new Set();
  let latestSnapshotAt = null;
  let firstSnapshotAt = null;
  let firstBoundaryDay = null;
  let latestBoundaryDay = null;
  for (const row of coverageRows) {
    const observedAt = rowValue(row, "observed_at", "observedAt");
    const boundaryDay = gamingActivityDay(observedAt);
    if (observedAt && (!latestSnapshotAt || new Date(observedAt) > new Date(latestSnapshotAt))) {
      latestSnapshotAt = observedAt;
      latestBoundaryDay = boundaryDay;
    }
    if (observedAt && (!firstSnapshotAt || new Date(observedAt) < new Date(firstSnapshotAt))) {
      firstSnapshotAt = observedAt;
      firstBoundaryDay = boundaryDay;
    }
    const precision = rowValue(row, "activity_precision", "activityPrecision");
    if (precision === "daily") {
      const day = dateOnly(rowValue(row, "activity_day", "activityDay"));
      if (day && (!startDay || day >= startDay) && (!endDay || day <= endDay)) reliableDays.add(day);
    } else if (precision === "uncertain") {
      const startedAt = rowValue(row, "interval_started_at", "intervalStartedAt");
      if (!startedAt || !observedAt) continue;
      const candidate = createInterval(startedAt, observedAt);
      if (!firstBoundaryDay || candidate.startDay < firstBoundaryDay) firstBoundaryDay = candidate.startDay;
      if ((!endDay || candidate.startDay <= endDay) && (!startDay || candidate.endDay >= startDay)) {
        uncertainKeys.add(candidate.key);
      }
    }
  }
  const effectiveStart = firstBoundaryDay && startDay
    ? (firstBoundaryDay > startDay ? firstBoundaryDay : startDay)
    : firstBoundaryDay || startDay;
  const rangeEndExclusive = endDay ? addDays(endDay, 1) : null;
  const endExclusive = targetBoundaryDay && rangeEndExclusive
    ? (targetBoundaryDay < rangeEndExclusive ? targetBoundaryDay : rangeEndExclusive)
    : targetBoundaryDay || rangeEndExclusive;
  const expectedCloseouts = effectiveStart && endExclusive
    ? Math.max(0, dayOrdinal(endExclusive) - dayOrdinal(effectiveStart))
    : 0;
  const missingCloseouts = Math.max(0, expectedCloseouts - reliableDays.size);
  const trailingMissingCloseouts = latestBoundaryDay && targetBoundaryDay
    ? Math.max(0, dayOrdinal(targetBoundaryDay) - dayOrdinal(latestBoundaryDay))
    : 0;
  return {
    status: !firstSnapshotAt || expectedCloseouts === 0
      ? "not_started"
      : missingCloseouts || uncertainKeys.size ? "partial" : "complete",
    reliableDays: reliableDays.size,
    expectedCloseouts,
    missingCloseouts,
    trailingMissingCloseouts,
    uncertainIntervals: uncertainKeys.size,
    latestSnapshotAt,
    firstSnapshotAt,
    closedThroughDay: latestBoundaryDay ? addDays(latestBoundaryDay, -1) : null,
    isCurrentPeriod: Boolean(targetBoundaryDay),
  };
}

function insightPeriodFor(range, today) {
  if (range === "all") {
    return {
      range, label: "All observed activity", startDay: null, endDay: today,
      throughDay: today, isIncomplete: true,
    };
  }
  const [year, month] = today.split("-").map(Number);
  if (range === "week") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const startDay = addDays(today, -((weekday + 6) % 7));
    return {
      range, label: "This week", startDay, endDay: addDays(startDay, 6),
      throughDay: today, isIncomplete: true,
    };
  }
  if (range === "month") {
    const startDay = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { range, label: "This month", startDay, endDay, throughDay: today, isIncomplete: true };
  }
  const startDay = `${year}-01-01`;
  const endDay = `${year}-12-31`;
  return {
    range, label: String(year), startDay, endDay, throughDay: today,
    isIncomplete: true,
  };
}

function rowValue(row, snake, camel) {
  return row?.[snake] ?? row?.[camel] ?? null;
}

function gameFromRow(row) {
  return {
    gameId: rowValue(row, "game_id", "gameId") == null ? null : Number(rowValue(row, "game_id", "gameId")),
    catalogGameId: rowValue(row, "catalog_game_id", "catalogGameId") == null
      ? null : Number(rowValue(row, "catalog_game_id", "catalogGameId")),
    steamAppId: String(rowValue(row, "steam_app_id", "steamAppId") || ""),
    name: rowValue(row, "game_name", "name") || "Steam game",
    cover: rowValue(row, "cover_url", "cover") || null,
    isBacklogGame: rowValue(row, "game_id", "gameId") != null,
  };
}

function ensureGame(container, row) {
  const metadata = gameFromRow(row);
  let game = container.gameMap.get(metadata.steamAppId);
  if (!game) {
    game = { ...metadata, playtimeMinutes: 0, achievements: [], highlights: [] };
    container.gameMap.set(metadata.steamAppId, game);
  } else {
    game.gameId ??= metadata.gameId;
    game.catalogGameId ??= metadata.catalogGameId;
    if (game.name === "Steam game" && metadata.name !== "Steam game") game.name = metadata.name;
    game.cover ||= metadata.cover;
    game.isBacklogGame ||= metadata.isBacklogGame;
  }
  return game;
}

function createDay(date) {
  return { type: "day", key: `day:${date}`, date, playtimeMinutes: 0, gameMap: new Map() };
}

function createInterval(startedAt, endedAt) {
  const startDay = gamingActivityDay(startedAt);
  const endDay = gamingActivityDay(endedAt);
  return {
    type: "uncertain", key: `interval:${startedAt}:${endedAt}`,
    intervalStartedAt: startedAt, intervalEndedAt: endedAt, startDay, endDay,
    playtimeMinutes: 0, gameMap: new Map(),
  };
}

function finalizeItem(item) {
  const games = [...item.gameMap.values()]
    .filter((game) => game.playtimeMinutes || game.achievements.length || game.highlights.length)
    .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes || a.name.localeCompare(b.name));
  return { ...item, gameMap: undefined, gameCount: games.length, games };
}

export function groupSteamActivityHistory(
  { observations = [], achievements = [], highlights = [], coverageRows = [] } = {},
  {
    range = "7d", today = gamingActivityDay(new Date()), timezone = "Asia/Jerusalem",
    rangeStartOverride = null,
  } = {},
) {
  const rangeStart = rangeStartOverride || rangeStartFor(range, today);
  const days = new Map();
  const intervals = new Map();
  const included = (day) => day && day <= today && (!rangeStart || day >= rangeStart);
  const overlapsRange = (startDay, endDay) => endDay && endDay >= (rangeStart || "0000-01-01") && startDay <= today;

  for (const row of observations) {
    const precision = rowValue(row, "activity_precision", "activityPrecision");
    const minutes = nonNegativeInteger(rowValue(row, "playtime_delta_minutes", "playtimeMinutes"));
    if (!minutes) continue;
    let item;
    if (precision === "daily") {
      const date = dateOnly(rowValue(row, "activity_day", "activityDay"));
      if (!included(date)) continue;
      item = days.get(date) || createDay(date);
      days.set(date, item);
    } else if (precision === "uncertain") {
      const startedAt = rowValue(row, "interval_started_at", "intervalStartedAt");
      const endedAt = rowValue(row, "observed_at", "observedAt");
      const candidate = createInterval(startedAt, endedAt);
      if (!startedAt || !overlapsRange(candidate.startDay, candidate.endDay)) continue;
      item = intervals.get(candidate.key) || candidate;
      intervals.set(candidate.key, item);
    } else continue;
    const game = ensureGame(item, row);
    game.playtimeMinutes += minutes;
    item.playtimeMinutes += minutes;
  }

  for (const row of achievements) {
    const date = dateOnly(rowValue(row, "activity_day", "activityDay"));
    if (!included(date)) continue;
    const item = days.get(date) || createDay(date);
    days.set(date, item);
    ensureGame(item, row).achievements.push({
      id: Number(row.id), name: rowValue(row, "display_name", "displayName"),
      description: row.description || null, icon: rowValue(row, "icon_url", "icon") || null,
    });
  }

  for (const row of highlights) {
    const payload = rowValue(row, "payload_json", "payload") || {};
    const type = rowValue(row, "event_type", "eventType");
    let item;
    if (payload.activityDay && included(payload.activityDay)) {
      item = days.get(payload.activityDay) || createDay(payload.activityDay);
      days.set(payload.activityDay, item);
    } else if (payload.activityPrecision === "uncertain" && payload.intervalStartedAt && payload.intervalEndedAt) {
      const candidate = createInterval(payload.intervalStartedAt, payload.intervalEndedAt);
      if (!overlapsRange(candidate.startDay, candidate.endDay)) continue;
      item = intervals.get(candidate.key) || candidate;
      intervals.set(candidate.key, item);
    } else continue;
    const highlight = type === "steam_first_played" ? { type: "first_played" }
      : type === "steam_added_to_library" ? { type: "added_to_library" }
        : type === "steam_returned" && nonNegativeInteger(payload.daysSincePrevious) > 0
          ? { type: "returned", daysSincePrevious: nonNegativeInteger(payload.daysSincePrevious) }
          : null;
    if (!highlight) continue;
    const game = ensureGame(item, row);
    if (!game.highlights.some((value) => value.type === highlight.type)) game.highlights.push(highlight);
  }

  const items = [...days.values(), ...intervals.values()].map(finalizeItem)
    .filter((item) => item.games.length)
    .sort((a, b) => {
      const aDate = a.type === "day" ? a.date : a.intervalEndedAt;
      const bDate = b.type === "day" ? b.date : b.intervalEndedAt;
      return String(bDate).localeCompare(String(aDate));
    });
  const containedPlaytime = items.reduce((total, item) => total + (
    item.type === "day" || !rangeStart || item.startDay >= rangeStart ? item.playtimeMinutes : 0
  ), 0);
  const overlappingPlaytime = items.reduce((total, item) => total + (
    item.type === "uncertain" && rangeStart && item.startDay < rangeStart ? item.playtimeMinutes : 0
  ), 0);
  const playedGames = new Set();
  items.forEach((item) => item.games.forEach((game) => {
    if (game.playtimeMinutes > 0 && (item.type === "day" || !rangeStart || item.startDay >= rangeStart)) {
      playedGames.add(game.steamAppId);
    }
  }));

  const coverage = summarizeCoverage(coverageRows, {
    startDay: rangeStart, endDay: today, targetBoundaryDay: today,
  });
  const achievementCount = items.reduce((total, item) =>
    total + item.games.reduce((subtotal, game) => subtotal + game.achievements.length, 0), 0);
  return {
    range, timezone, rangeStart, throughActivityDay: today,
    summary: {
      playtimeMinutes: containedPlaytime, overlappingPlaytimeMinutes: overlappingPlaytime,
      gamesPlayed: playedGames.size, achievementsUnlocked: achievementCount,
    },
    coverage,
    items,
  };
}

function insightIncluded(day, period) {
  return day && day <= (period.throughDay || period.endDay) &&
    (!period.startDay || day >= period.startDay);
}

function intervalEligibility(startDay, endDay, period) {
  if (!startDay || !endDay) return "excluded";
  const effectiveEnd = period.throughDay || period.endDay;
  if (endDay < (period.startDay || "0000-01-01") || startDay > effectiveEnd) return "excluded";
  if ((!period.startDay || startDay >= period.startDay) && endDay <= effectiveEnd) return "contained";
  return "overlap";
}

function insightGame(gameMap, row) {
  const metadata = gameFromRow(row);
  let game = gameMap.get(metadata.steamAppId);
  if (!game) {
    game = { ...metadata, playtimeMinutes: 0, reliablePlaytimeMinutes: 0, uncertainPlaytimeMinutes: 0 };
    gameMap.set(metadata.steamAppId, game);
  }
  game.name = game.name === "Steam game" ? metadata.name : game.name;
  game.cover ||= metadata.cover;
  game.gameId ??= metadata.gameId;
  game.catalogGameId ??= metadata.catalogGameId;
  game.isBacklogGame ||= metadata.isBacklogGame;
  return game;
}

function finalizeInsightGames(gameMap) {
  return [...gameMap.values()]
    .filter((game) => game.playtimeMinutes > 0)
    .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes || a.name.localeCompare(b.name));
}

export function groupSteamActivityInsights(
  { observations = [], achievements = [], highlights = [], coverageRows = [] } = {},
  { range = "week", today = gamingActivityDay(new Date()), timezone = "Asia/Jerusalem" } = {},
) {
  const period = insightPeriodFor(range, today);
  const gameMap = new Map();
  const unallocatedGameMap = new Map();
  const dailyMap = new Map();
  const reliableActivityDays = new Set();
  const uncertainIntervals = new Map();
  const unallocatedIntervals = new Map();
  let reliablePlaytimeMinutes = 0;
  let uncertainPlaytimeMinutes = 0;
  let unallocatedPlaytimeMinutes = 0;

  const ensureDaily = (day) => {
    let item = dailyMap.get(day);
    if (!item) {
      item = { day, playtimeMinutes: 0, achievementsUnlocked: 0, gameMap: new Map() };
      dailyMap.set(day, item);
    }
    return item;
  };

  const ensureDailyGame = (daily, row) => {
    const metadata = gameFromRow(row);
    let game = daily.gameMap.get(metadata.steamAppId);
    if (!game) {
      game = { ...metadata, playtimeMinutes: 0, achievementsUnlocked: 0 };
      daily.gameMap.set(metadata.steamAppId, game);
    }
    game.name = game.name === "Steam game" ? metadata.name : game.name;
    game.cover ||= metadata.cover;
    game.gameId ??= metadata.gameId;
    game.catalogGameId ??= metadata.catalogGameId;
    game.isBacklogGame ||= metadata.isBacklogGame;
    return game;
  };

  for (const row of observations) {
    const minutes = nonNegativeInteger(rowValue(row, "playtime_delta_minutes", "playtimeMinutes"));
    if (!minutes) continue;
    const precision = rowValue(row, "activity_precision", "activityPrecision");
    if (precision === "daily") {
      const day = dateOnly(rowValue(row, "activity_day", "activityDay"));
      if (!insightIncluded(day, period)) continue;
      const game = insightGame(gameMap, row);
      game.playtimeMinutes += minutes;
      game.reliablePlaytimeMinutes += minutes;
      reliablePlaytimeMinutes += minutes;
      const daily = ensureDaily(day);
      daily.playtimeMinutes += minutes;
      ensureDailyGame(daily, row).playtimeMinutes += minutes;
      reliableActivityDays.add(day);
      continue;
    }
    if (precision !== "uncertain") continue;
    const startedAt = rowValue(row, "interval_started_at", "intervalStartedAt");
    const endedAt = rowValue(row, "observed_at", "observedAt");
    const candidate = createInterval(startedAt, endedAt);
    const eligibility = intervalEligibility(candidate.startDay, candidate.endDay, period);
    if (eligibility === "excluded") continue;
    const key = candidate.key;
    const intervalMap = eligibility === "contained" ? uncertainIntervals : unallocatedIntervals;
    const gameTarget = eligibility === "contained" ? gameMap : unallocatedGameMap;
    const interval = intervalMap.get(key) || {
      key, startDay: candidate.startDay, endDay: candidate.endDay,
      intervalStartedAt: startedAt, intervalEndedAt: endedAt, playtimeMinutes: 0,
    };
    interval.playtimeMinutes += minutes;
    intervalMap.set(key, interval);
    const game = insightGame(gameTarget, row);
    game.playtimeMinutes += minutes;
    game.uncertainPlaytimeMinutes += minutes;
    if (eligibility === "contained") uncertainPlaytimeMinutes += minutes;
    else unallocatedPlaytimeMinutes += minutes;
  }

  let achievementsUnlocked = 0;
  for (const row of achievements) {
    const day = dateOnly(rowValue(row, "activity_day", "activityDay"));
    if (!insightIncluded(day, period)) continue;
    achievementsUnlocked += 1;
    const daily = ensureDaily(day);
    daily.achievementsUnlocked += 1;
    ensureDailyGame(daily, row).achievementsUnlocked += 1;
  }

  const firstObservedPlays = [];
  const reliableReturns = [];
  for (const row of highlights) {
    const payload = rowValue(row, "payload_json", "payload") || {};
    if (payload.activityPrecision !== "daily" || !insightIncluded(payload.activityDay, period)) continue;
    const game = gameFromRow(row);
    const base = { ...game, activityDay: payload.activityDay };
    const type = rowValue(row, "event_type", "eventType");
    if (type === "steam_first_played") firstObservedPlays.push(base);
    if (type === "steam_returned" && nonNegativeInteger(payload.daysSincePrevious) >= 2) {
      reliableReturns.push({ ...base, daysSincePrevious: nonNegativeInteger(payload.daysSincePrevious) });
    }
  }

  const games = finalizeInsightGames(gameMap);
  const coverage = summarizeCoverage(coverageRows, {
    startDay: period.startDay,
    endDay: period.throughDay || period.endDay,
    targetBoundaryDay: period.throughDay || addDays(period.endDay, 1),
  });

  const preciseActiveDays = reliableActivityDays.size;
  const dailyBars = [...dailyMap.values()]
    .map(({ gameMap: dailyGames, ...day }) => ({
      ...day,
      games: [...dailyGames.values()]
        .filter((game) => game.playtimeMinutes > 0 || game.achievementsUnlocked > 0)
        .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const reliableCoverageSufficient = coverage.reliableDays >= 7 && coverage.missingCloseouts === 0;
  return {
    range, timezone, period,
    summary: {
      playtimeMinutes: reliablePlaytimeMinutes + uncertainPlaytimeMinutes,
      reliablePlaytimeMinutes,
      uncertainPlaytimeMinutes,
      unallocatedPlaytimeMinutes,
      gamesPlayed: games.length,
      achievementsUnlocked,
      preciseActiveDays,
      preciseDailyAverageMinutes: preciseActiveDays
        ? Math.round(reliablePlaytimeMinutes / preciseActiveDays)
        : null,
    },
    coverage: { ...coverage, reliableCoverageSufficient, patternClaimsAvailable: reliableCoverageSufficient },
    mostPlayed: games.slice(0, 5),
    firstObservedPlays,
    reliableReturns,
    dailyBars,
    uncertainIntervals: [...uncertainIntervals.values()].sort((a, b) => b.endDay.localeCompare(a.endDay)),
    unallocatedOverlap: {
      playtimeMinutes: unallocatedPlaytimeMinutes,
      intervals: [...unallocatedIntervals.values()].sort((a, b) => b.endDay.localeCompare(a.endDay)),
      games: finalizeInsightGames(unallocatedGameMap),
    },
  };
}

async function loadSteamActivityLedger(userId, rangeStart = null) {
  const achievementMetadata = `
    LEFT JOIN games game ON game.id = source_row.game_id AND game.user_id = source_row.user_id
    LEFT JOIN catalog_games catalog ON catalog.id = source_row.catalog_game_id
    LEFT JOIN LATERAL (
      SELECT steam_name, steam_icon_url FROM steam_import_candidates candidate
       WHERE candidate.user_id = source_row.user_id
         AND candidate.steam_app_id = source_row.steam_app_id LIMIT 1
    ) candidate ON TRUE`;
  const eventMetadata = `
    LEFT JOIN games game ON game.id = COALESCE(event.game_id, source_row.game_id)
      AND game.user_id = event.user_id
    LEFT JOIN catalog_games catalog ON catalog.id = COALESCE(event.catalog_game_id, source_row.catalog_game_id)
    LEFT JOIN LATERAL (
      SELECT steam_name, steam_icon_url FROM steam_import_candidates candidate
       WHERE candidate.user_id = event.user_id
         AND candidate.steam_app_id = event.external_id LIMIT 1
    ) candidate ON TRUE`;
  const [observationResult, achievementResult, highlightResult, coverageResult] = await Promise.all([
    pool.query(
      `SELECT observation.* FROM steam_activity_observations observation
       WHERE observation.user_id = $1
         AND observation.playtime_delta_minutes > 0
         AND ($2::date IS NULL OR observation.activity_day >= $2::date
           OR (observation.activity_precision = 'uncertain'
             AND gaming_activity_day(observation.observed_at) >= $2::date))
       ORDER BY observation.observed_at DESC, observation.id DESC`,
      [userId, rangeStart],
    ),
    pool.query(
      `SELECT unlock.id, unlock.user_id, unlock.game_id, unlock.catalog_game_id,
         unlock.steam_app_id, unlock.display_name, unlock.description, unlock.icon_url,
         unlock.unlock_at, unlock.activity_day,
         COALESCE(game.name, catalog.name, candidate.steam_name, 'Steam game') AS game_name,
         COALESCE(game.cover, catalog.cover_url, candidate.steam_icon_url) AS cover_url
       FROM steam_achievement_unlocks source_row
       JOIN steam_achievement_unlocks unlock ON unlock.id = source_row.id
       ${achievementMetadata}
       WHERE unlock.user_id = $1 AND unlock.is_baseline = FALSE AND unlock.unlock_at IS NOT NULL
         AND ($2::date IS NULL OR unlock.activity_day >= $2::date)
       ORDER BY unlock.activity_day DESC, unlock.unlock_at, unlock.id`,
      [userId, rangeStart],
    ),
    pool.query(
      `SELECT event.id, event.user_id, event.game_id, event.catalog_game_id,
         event.external_id AS steam_app_id, event.event_type, event.payload_json,
         COALESCE(game.name, catalog.name, candidate.steam_name, 'Steam game') AS game_name,
         COALESCE(game.cover, catalog.cover_url, candidate.steam_icon_url) AS cover_url
       FROM user_activity_events event
       LEFT JOIN user_game_sources source_row ON source_row.user_id = event.user_id
         AND source_row.provider = 'steam' AND source_row.provider_app_id = event.external_id
       ${eventMetadata}
       WHERE event.user_id = $1 AND event.event_kind = 'fact'
         AND event.event_type IN ('steam_first_played', 'steam_returned', 'steam_added_to_library')
         AND ($2::date IS NULL OR event.payload_json->>'activityDay' >= $2::text
           OR (event.payload_json->>'activityPrecision' = 'uncertain'
             AND gaming_activity_day(NULLIF(event.payload_json->>'intervalEndedAt', '')::timestamptz) >= $2::date))
       ORDER BY event.observed_at DESC, event.id DESC`,
      [userId, rangeStart],
    ),
    pool.query(
      `SELECT DISTINCT ON (observation.sync_run_id)
         observation.sync_run_id, observation.observed_at, observation.interval_started_at,
         observation.activity_precision, observation.activity_day
       FROM steam_activity_observations observation
       WHERE observation.user_id = $1
       ORDER BY observation.sync_run_id, observation.id`,
      [userId],
    ),
  ]);
  return {
    observations: observationResult.rows,
    achievements: achievementResult.rows,
    highlights: highlightResult.rows,
    coverageRows: coverageResult.rows,
  };
}

function legacyHistoryDays(items) {
  return items.map((item) => ({
    date: item.type === "day" ? item.date : item.endDay,
    playtimeMinutes: item.playtimeMinutes,
    achievementsUnlocked: item.games.reduce((total, game) => total + game.achievements.length, 0),
    hasGap: item.type === "uncertain",
    games: item.games.map((game) => ({
      id: `${item.key}:${game.steamAppId}`,
      ...game,
      achievementsUnlocked: game.achievements.length,
      hasGap: item.type === "uncertain",
      intervalStartedAt: item.intervalStartedAt || null,
      observedAt: item.intervalEndedAt || null,
    })),
  }));
}

export async function listSteamActivityHistory(userId, { range, days } = {}) {
  const today = gamingActivityDay(new Date());
  const legacyWindow = days == null ? null : Math.min(Math.max(Number(days) || 35, 7), 180);
  const effectiveRange = range || (legacyWindow ? `${legacyWindow}d` : "7d");
  const rangeStart = legacyWindow
    ? dayFromOrdinal(dayOrdinal(today) - legacyWindow + 1)
    : rangeStartFor(effectiveRange, today);
  const ledger = await loadSteamActivityLedger(userId, rangeStart);
  const result = groupSteamActivityHistory(ledger, {
    range: effectiveRange, today, rangeStartOverride: rangeStart,
  });
  const compatibilityDays = legacyHistoryDays(result.items);
  return {
    ...result,
    days: compatibilityDays,
    summary: { ...result.summary, activeDays: compatibilityDays.length },
    ...(legacyWindow ? { deprecated: { days: true, use: "range=7d|30d|all" } } : {}),
  };
}

export async function listSteamActivityInsights(userId, { range = "week" } = {}) {
  const today = gamingActivityDay(new Date());
  const period = insightPeriodFor(range, today);
  const ledger = await loadSteamActivityLedger(userId, period.startDay);
  return groupSteamActivityInsights(ledger, { range, today });
}
