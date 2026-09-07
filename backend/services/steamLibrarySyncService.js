import crypto from "node:crypto";
import { pool } from "../db.js";
import { assertSteamUser, lockSteamSyncJob } from "./steamSyncLease.js";
import { badRequest } from "../utils/httpError.js";
import { normStatus, statusGroupOf } from "../utils/status.js";
import { createOpenActivityEvent } from "./activityEventService.js";
import {
  createIntegrationSyncRun,
  finishIntegrationSyncRun,
  getIntegrationSyncRun,
  serializeIntegrationSyncRun,
} from "./integrationSyncService.js";
import {
  autoMatchSteamCandidates,
  fetchOwnedSteamGames,
  fetchPlayerSummary,
  getSteamAccount,
  listDueSteamAchievementSourceIds,
  prepareSteamLibraryCandidate,
  serializeSteamAccount,
  syncSteamAchievementsForSourceIds,
} from "./steamService.js";
import {
  failSteamWishlistJob,
  processSteamWishlistJob,
} from "./steamWishlistService.js";
import { processSteamPriceJob, failSteamPriceJob } from './steamPriceSyncService.js';

const SYNC_COOLDOWN_MS = 15 * 60 * 1000;
const SYNC_AUTO_MATCH_LIMIT = 150;
const STEAM_SYNC_CHUNK_SIZE = Math.min(
  Math.max(Number(process.env.STEAM_SYNC_CHUNK_SIZE) || 20, 1),
  100,
);
const STEAM_SYNC_JOB_LEASE_MS = Math.max(
  Number(process.env.STEAM_SYNC_JOB_LEASE_MS) || 5 * 60 * 1000,
  1_000,
);
const STEAM_SYNC_JOB_HEARTBEAT_MS = Math.max(
  Math.min(
    Number(process.env.STEAM_SYNC_JOB_HEARTBEAT_MS) ||
      Math.floor(STEAM_SYNC_JOB_LEASE_MS / 3),
    Math.floor(STEAM_SYNC_JOB_LEASE_MS / 2),
  ),
  250,
);
const STEAM_SYNC_WAIT_TIMEOUT_MS = Math.max(
  Number(process.env.STEAM_SYNC_WAIT_TIMEOUT_MS) || 30 * 60 * 1000,
  1_000,
);

function nowIso() {
  return new Date().toISOString();
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function withActiveJobLease(job, work) {
  return withTransaction(async (client) => {
    const current = await lockSteamSyncJob(client, job);
    if (!current) return { active: false, value: null };
    return { active: true, value: await work(client, current) };
  });
}

async function hasActiveJobLease(job) {
  if (!job?.lease_token) return false;
  const { rows } = await pool.query(
    `SELECT id FROM steam_sync_jobs
      WHERE id = $1 AND status = 'running' AND lease_token = $2`,
    [job.id, job.lease_token],
  );
  return Boolean(rows[0]);
}

function startJobLeaseHeartbeat(job) {
  if (!job?.lease_token) return () => {};
  let stopped = false;
  let updating = false;
  const heartbeat = async () => {
    if (stopped || updating) return;
    updating = true;
    try {
      await pool.query(
        `UPDATE steam_sync_jobs
            SET locked_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'running' AND lease_token = $2`,
        [job.id, job.lease_token],
      );
    } catch {}
    updating = false;
  };
  const timer = setInterval(heartbeat, STEAM_SYNC_JOB_HEARTBEAT_MS);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function dateMs(value) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function validPlaytime(value, fallback = 0) {
  if (value == null || !Number.isFinite(Number(value))) return fallback;
  return Math.max(0, Math.trunc(Number(value)));
}

function activeSteamSource(source) {
  return source && source.source_status !== "disconnected";
}

export function hasSuccessfulSteamBaseline(account, sources = []) {
  return Boolean(
    account?.last_library_sync_at && sources.some((source) => activeSteamSource(source)),
  );
}

export function diffSteamLibrarySnapshot(games = [], sources = []) {
  const byAppId = new Map(
    sources.map((source) => [String(source.provider_app_id), source]),
  );
  const workItems = [];
  const unchangedAppIds = [];
  for (const app of games) {
    const appId = String(app.appid);
    const source = byAppId.get(appId) || null;
    const activeSource = activeSteamSource(source) ? source : null;
    const isNew = !activeSource;
    const previousPlaytime = validPlaytime(
      activeSource?.playtime_minutes_forever,
      0,
    );
    const nextPlaytime = validPlaytime(app.playtimeMinutes, previousPlaytime);
    const previousLastPlayed = dateMs(activeSource?.last_played_at);
    const nextLastPlayed = dateMs(app.lastPlayedAt);
    const playtimeChanged = !isNew && nextPlaytime !== previousPlaytime;
    const playtimeAdvanced = !isNew && nextPlaytime > previousPlaytime;
    const lastPlayedChanged =
      !isNew && nextLastPlayed != null && nextLastPlayed !== previousLastPlayed;
    const lastPlayedAdvanced =
      nextLastPlayed != null &&
      (previousLastPlayed == null || nextLastPlayed > previousLastPlayed);
    const activityChanged = playtimeAdvanced || (!isNew && lastPlayedAdvanced);
    const firstPlayObserved =
      !isNew && previousPlaytime <= 0 && nextPlaytime > 0;
    let kind = "unchanged";
    if (isNew) kind = "new";
    else if (playtimeChanged) kind = "playtime_changed";
    else if (lastPlayedChanged) kind = "last_played_changed";
    const item = {
      app: {
        ...app,
        appid: appId,
        playtimeMinutes: nextPlaytime,
      },
      kind,
      isNew,
      activityChanged,
      firstPlayObserved,
    };
    if (kind === "unchanged") unchangedAppIds.push(appId);
    else workItems.push(item);
  }
  return {
    itemsSeen: games.length,
    workItems,
    unchangedAppIds,
    newGames: workItems.filter((item) => item.isNew).length,
    activityChanged: workItems.filter((item) => item.activityChanged).length,
  };
}

function emptySyncReview() {
  return {
    startedPlaying: [],
    statusSuggestions: [],
    newSteamGames: [],
    total: 0,
  };
}

function emptySyncProgress() {
  return {
    matched: 0,
    duplicates: 0,
    filtered: 0,
    needsReview: 0,
    sourceWrites: { created: 0, updated: 0, unchanged: 0 },
    candidateWrites: { created: 0, updated: 0, unchanged: 0 },
    newCandidateIds: [],
    achievementSourceIds: [],
    reviewItemsCreated: 0,
    syncReview: emptySyncReview(),
  };
}

function normalizeSyncProgress(value = {}) {
  const defaults = emptySyncProgress();
  return {
    ...defaults,
    ...value,
    sourceWrites: { ...defaults.sourceWrites, ...(value.sourceWrites || {}) },
    candidateWrites: {
      ...defaults.candidateWrites,
      ...(value.candidateWrites || {}),
    },
    newCandidateIds: Array.isArray(value.newCandidateIds)
      ? value.newCandidateIds
      : [],
    achievementSourceIds: Array.isArray(value.achievementSourceIds)
      ? value.achievementSourceIds
      : [],
    syncReview: {
      ...defaults.syncReview,
      ...(value.syncReview || {}),
      startedPlaying: Array.isArray(value.syncReview?.startedPlaying)
        ? value.syncReview.startedPlaying
        : [],
      statusSuggestions: Array.isArray(value.syncReview?.statusSuggestions)
        ? value.syncReview.statusSuggestions
        : [],
      newSteamGames: Array.isArray(value.syncReview?.newSteamGames)
        ? value.syncReview.newSteamGames
        : [],
    },
  };
}

function serializeSyncJob(row) {
  if (!row) return null;
  const run = row.sync_run
    ? serializeIntegrationSyncRun(row.sync_run)
    : row.result_json?.run || null;
  return {
    id: row.id,
    status: row.status,
    triggerType: row.trigger_type || "manual",
    syncKind: row.sync_kind || "library",
    syncRunId: row.sync_run_id == null ? null : Number(row.sync_run_id),
    run,
    cursor: Number(row.cursor) || 0,
    total: row.total == null ? null : Number(row.total),
    progress: row.progress_json || {},
    result: row.result_json || null,
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function loadSteamSources(userId) {
  const { rows } = await pool.query(
    `
    SELECT source.*, game.name AS game_name, game.status AS game_status,
           game.started_at AS game_started_at
    FROM user_game_sources source
    LEFT JOIN games game
      ON game.id = source.game_id AND game.user_id = source.user_id
    WHERE source.user_id = $1 AND source.provider = 'steam'
    `,
    [userId],
  );
  return rows;
}

async function persistLegacyReviewEvents(job, runId, client) {
  const review = job.progress_json?.syncReview;
  if (!review) return;
  const groups = [
    ["startedPlaying", "steam_started_playing"],
    ["statusSuggestions", "steam_status_suggestion"],
    ["newSteamGames", "steam_new_game"],
  ];
  for (const [group, eventType] of groups) {
    for (const item of Array.isArray(review[group]) ? review[group] : []) {
      const appId = String(item?.steamAppId || "").trim();
      if (!appId) continue;
      let gameId = Number(item?.gameId);
      gameId = Number.isInteger(gameId) ? gameId : null;
      if (gameId) {
        const ownedGame = await client.query(
          "SELECT id FROM games WHERE id = $1 AND user_id = $2",
          [gameId, job.user_id],
        );
        if (!ownedGame.rows[0]) gameId = null;
      }
      if (eventType === "steam_status_suggestion" && !gameId) continue;
      let catalogGameId = Number(item?.catalogGameId);
      catalogGameId = Number.isInteger(catalogGameId) ? catalogGameId : null;
      if (catalogGameId) {
        const catalogGame = await client.query(
          "SELECT id FROM catalog_games WHERE id = $1",
          [catalogGameId],
        );
        if (!catalogGame.rows[0]) catalogGameId = null;
      }
      const dedupeKey =
        eventType === "steam_new_game"
          ? `new-game:${appId}`
          : eventType === "steam_started_playing"
            ? `first-play:${appId}`
            : `status-suggestion:${appId}:${normStatus(item?.currentStatus) || "unknown"}`;
      await createOpenActivityEvent(
        {
          userId: job.user_id,
          source: "steam_library",
          eventType,
          gameId,
          catalogGameId,
          externalId: appId,
          syncRunId: runId,
          dedupeKey,
          payload: item,
          observedAt: job.updated_at || job.started_at || null,
        },
        client,
      );
    }
  }
}

async function ensureRunForJob(job) {
  if (job.sync_run_id) return job;
  return withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM steam_sync_jobs
        WHERE id = $1 AND status = 'running' AND lease_token = $2
        FOR UPDATE`,
      [job.id, job.lease_token],
    );
    const current = locked.rows[0];
    if (!current) return null;
    if (current.sync_run_id) return current;
    const run = await createIntegrationSyncRun(
      current.user_id,
      {
        provider: "steam",
        syncKind: current.sync_kind || "library",
        triggerType: current.trigger_type || "manual",
      },
      client,
    );
    const { rows } = await client.query(
      `
      UPDATE steam_sync_jobs
         SET sync_run_id = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *
      `,
      [current.id, run.id],
    );
    if ((current.sync_kind || "library") === "library") {
      await persistLegacyReviewEvents(current, run.id, client);
    }
    return rows[0];
  });
}

function staleLinkedStatus(status) {
  const normalized = normStatus(status);
  return Boolean(normalized) && !["playing", "done"].includes(statusGroupOf(normalized));
}

function reviewItem(app, source, candidate, game, activityEventId) {
  return {
    activityEventId: activityEventId || null,
    steamAppId: String(app.appid),
    steamName: app.name,
    steamIconUrl: app.iconUrl || null,
    playtimeMinutes: Number(app.playtimeMinutes) || 0,
    lastPlayedAt: app.lastPlayedAt || null,
    firstPlayObservedAt: source.first_play_observed_at || null,
    candidateId: candidate?.id || null,
    gameId: game?.id || null,
    gameName: game?.name || null,
    currentStatus: game?.status || null,
    startedAt: game?.started_at || null,
    suggestedStatus: "playing",
    suggestedStatusReason: "Steam shows new play activity.",
    suggestedStatusConfidence: "medium",
  };
}

async function persistWorkItem(job, item, prepared) {
  return withTransaction(async (client) => {
    const runningJob = await lockSteamSyncJob(client, job);
    if (!runningJob) return null;
    const beforeSourceResult = await client.query(
      `
      SELECT source.*, game.name AS game_name, game.status AS game_status,
             game.started_at AS game_started_at
      FROM user_game_sources source
      LEFT JOIN games game
        ON game.id = source.game_id AND game.user_id = source.user_id
      WHERE source.user_id = $1
        AND source.provider = 'steam'
        AND source.provider_app_id = $2
      FOR UPDATE OF source
      `,
      [job.user_id, item.app.appid],
    );
    const before = beforeSourceResult.rows[0] || null;
    const activeBefore = activeSteamSource(before) ? before : null;
    const wasNew = !activeBefore;
    const previousPlaytime = validPlaytime(
      activeBefore?.playtime_minutes_forever,
      0,
    );
    const nextPlaytime = validPlaytime(item.app.playtimeMinutes, previousPlaytime);
    const previousLastPlayed = dateMs(activeBefore?.last_played_at);
    const nextLastPlayed = dateMs(item.app.lastPlayedAt);
    const playtimeAdvanced = !wasNew && nextPlaytime > previousPlaytime;
    const lastPlayedAdvanced =
      !wasNew &&
      nextLastPlayed != null &&
      (previousLastPlayed == null || nextLastPlayed > previousLastPlayed);
    const activityChanged = playtimeAdvanced || lastPlayedAdvanced;
    const firstPlayJustSet =
      !activeBefore?.first_play_observed_at &&
      ((wasNew && job.payload_json.hasPreviousSync && nextPlaytime > 0) ||
        (!wasNew && previousPlaytime <= 0 && nextPlaytime > 0));
    const duplicate = prepared?.duplicate || null;
    const match = prepared?.match || {
      catalogGameId: activeBefore?.catalog_game_id || null,
      confidence: "none",
      reason: "Existing Steam source.",
    };
    const firstObservedAt = firstPlayJustSet
      ? item.app.lastPlayedAt || new Date()
      : activeBefore?.first_play_observed_at || null;
    const beforeCandidate = item.isNew
      ? await client.query(
          `SELECT * FROM steam_import_candidates
            WHERE user_id = $1 AND steam_app_id = $2
            LIMIT 1 FOR UPDATE`,
          [job.user_id, item.app.appid],
        )
      : { rows: [] };
    const candidateWasIgnored =
      beforeCandidate.rows[0]?.import_status === "ignored";
    const { rows: sourceRows } = await client.query(
      `
      INSERT INTO user_game_sources (
        user_id, game_id, catalog_game_id, provider, provider_app_id,
        relationship, source_status, playtime_minutes_forever, last_played_at,
        first_play_observed_at, first_play_observed_playtime_minutes,
        ignored_at, last_synced_at, updated_at
      )
      VALUES (
        $1, $2, $3, 'steam', $4, 'owned',
        CASE WHEN $9::boolean THEN 'ignored' ELSE 'owned' END,
        $5, $6, $7, $8,
        CASE WHEN $9::boolean THEN NOW() ELSE NULL END,
        NOW(), NOW()
      )
      ON CONFLICT (user_id, provider, provider_app_id)
      DO UPDATE SET
        game_id = COALESCE(user_game_sources.game_id, EXCLUDED.game_id),
        catalog_game_id = COALESCE(user_game_sources.catalog_game_id, EXCLUDED.catalog_game_id),
        source_status = CASE
          WHEN user_game_sources.source_status = 'ignored' OR $9::boolean THEN 'ignored'
          ELSE 'owned'
        END,
        ignored_at = CASE
          WHEN user_game_sources.source_status = 'ignored' OR $9::boolean
            THEN COALESCE(user_game_sources.ignored_at, NOW())
          ELSE NULL
        END,
        playtime_minutes_forever = CASE
          WHEN EXCLUDED.playtime_minutes_forever IS NULL
            THEN user_game_sources.playtime_minutes_forever
          ELSE EXCLUDED.playtime_minutes_forever
        END,
        last_played_at = CASE
          WHEN EXCLUDED.last_played_at IS NULL THEN user_game_sources.last_played_at
          ELSE EXCLUDED.last_played_at
        END,
        first_play_observed_at = COALESCE(
          user_game_sources.first_play_observed_at,
          EXCLUDED.first_play_observed_at
        ),
        first_play_observed_playtime_minutes = COALESCE(
          user_game_sources.first_play_observed_playtime_minutes,
          EXCLUDED.first_play_observed_playtime_minutes
        ),
        last_synced_at = NOW(),
        updated_at = NOW()
      RETURNING *
      `,
      [
        job.user_id,
        candidateWasIgnored
          ? null
          : duplicate?.id || activeBefore?.game_id || null,
        candidateWasIgnored
          ? null
          : match.catalogGameId || activeBefore?.catalog_game_id || null,
        item.app.appid,
        nextPlaytime,
        item.app.lastPlayedAt || null,
        firstObservedAt,
        firstPlayJustSet ? nextPlaytime : null,
        candidateWasIgnored,
      ],
    );
    const source = sourceRows[0];
    if (source.source_status === 'owned' && source.game_id &&
        (activityChanged || (wasNew && nextPlaytime > 0))) {
      await client.query(
        `UPDATE user_game_sources SET
          achievements_pending_at = COALESCE(achievements_pending_at, NOW()),
          achievements_next_attempt_at = COALESCE(achievements_next_attempt_at,
            GREATEST(NOW(), COALESCE(achievements_last_attempt_at, achievements_last_synced_at) + INTERVAL '6 hours')),
          achievements_revision = achievements_revision + 1
         WHERE id = $1`,
        [source.id],
      );
    }
    if (wasNew && job.payload_json.hasPreviousSync) {
      await client.query("UPDATE user_game_sources SET ownership_observed_run_id = $2 WHERE id = $1", [source.id, job.sync_run_id]);
    }

    let candidate = null;
    let candidateState = "unchanged";
    if (item.isNew && prepared) {
      const { rows } = await client.query(
        `
        INSERT INTO steam_import_candidates (
          user_id, steam_app_id, steam_name, steam_icon_url,
          playtime_minutes_forever, last_played_at, proposed_catalog_game_id,
          duplicate_game_id, match_confidence, match_reason, filtered_reason,
          suggested_status, suggested_status_reason,
          suggested_status_confidence, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (user_id, steam_app_id)
        DO UPDATE SET
          steam_name = EXCLUDED.steam_name,
          steam_icon_url = EXCLUDED.steam_icon_url,
          playtime_minutes_forever = EXCLUDED.playtime_minutes_forever,
          last_played_at = COALESCE(EXCLUDED.last_played_at, steam_import_candidates.last_played_at),
          proposed_catalog_game_id = CASE
            WHEN steam_import_candidates.import_status = 'ignored'
              THEN steam_import_candidates.proposed_catalog_game_id
            ELSE COALESCE(
              steam_import_candidates.user_selected_catalog_game_id,
              EXCLUDED.proposed_catalog_game_id
            )
          END,
          duplicate_game_id = CASE
            WHEN steam_import_candidates.import_status = 'ignored'
              THEN steam_import_candidates.duplicate_game_id
            ELSE EXCLUDED.duplicate_game_id
          END,
          match_confidence = CASE
            WHEN steam_import_candidates.import_status = 'ignored'
              THEN steam_import_candidates.match_confidence
            WHEN steam_import_candidates.user_selected_catalog_game_id IS NOT NULL THEN 'exact'
            ELSE EXCLUDED.match_confidence
          END,
          match_reason = CASE
            WHEN steam_import_candidates.import_status = 'ignored'
              THEN steam_import_candidates.match_reason
            WHEN steam_import_candidates.user_selected_catalog_game_id IS NOT NULL
              THEN 'User selected catalog match.'
            ELSE EXCLUDED.match_reason
          END,
          filtered_reason = CASE
            WHEN steam_import_candidates.import_status = 'ignored'
              THEN steam_import_candidates.filtered_reason
            ELSE EXCLUDED.filtered_reason
          END,
          suggested_status = CASE
            WHEN steam_import_candidates.import_status = 'ignored'
              THEN steam_import_candidates.suggested_status
            ELSE EXCLUDED.suggested_status
          END,
          suggested_status_reason = CASE
            WHEN steam_import_candidates.import_status = 'ignored'
              THEN steam_import_candidates.suggested_status_reason
            ELSE EXCLUDED.suggested_status_reason
          END,
          suggested_status_confidence = CASE
            WHEN steam_import_candidates.import_status = 'ignored'
              THEN steam_import_candidates.suggested_status_confidence
            ELSE EXCLUDED.suggested_status_confidence
          END,
          updated_at = NOW()
        WHERE steam_import_candidates.import_status IN ('pending', 'accepted', 'attached', 'ignored')
        RETURNING *
        `,
        [
          job.user_id,
          item.app.appid,
          item.app.name,
          item.app.iconUrl || null,
          nextPlaytime,
          item.app.lastPlayedAt || null,
          match.catalogGameId || null,
          duplicate?.id || null,
          match.confidence,
          match.reason,
          prepared.filteredReason,
          prepared.recommendation?.status || null,
          prepared.recommendation?.reason || null,
          prepared.recommendation?.confidence || null,
        ],
      );
      candidate = rows[0] || beforeCandidate.rows[0] || null;
      candidateState = beforeCandidate.rows[0] ? "updated" : "created";
    }

    const linkedGameId = source.game_id || null;
    let game = duplicate;
    if (linkedGameId && game?.id !== linkedGameId) {
      const gameResult = await client.query(
        "SELECT id, name, status, started_at FROM games WHERE id = $1 AND user_id = $2",
        [linkedGameId, job.user_id],
      );
      game = gameResult.rows[0] || null;
    }

    let eventType = null;
    let dedupeKey = null;
    let reviewType = null;
    const ignored = source.source_status === "ignored";
    const filtered = Boolean(prepared?.filteredReason);
    if (job.payload_json.hasPreviousSync && !ignored && !filtered) {
      if (
        game &&
        nextPlaytime > 0 &&
        (wasNew || activityChanged) &&
        staleLinkedStatus(game.status)
      ) {
        eventType = "steam_status_suggestion";
        dedupeKey = `status-suggestion:${item.app.appid}:${normStatus(game.status)}`;
        reviewType = "statusSuggestions";
      } else if (!game && wasNew && nextPlaytime > 0) {
        eventType = "steam_started_playing";
        dedupeKey = `first-play:${item.app.appid}`;
        reviewType = "startedPlaying";
      } else if (!game && wasNew) {
        eventType = "steam_new_game";
        dedupeKey = `new-game:${item.app.appid}`;
        reviewType = "newSteamGames";
      } else if (!game && firstPlayJustSet) {
        eventType = "steam_started_playing";
        dedupeKey = `first-play:${item.app.appid}`;
        reviewType = "startedPlaying";
      }
    }

    let event = null;
    if (eventType) {
      const payload = reviewItem(item.app, source, candidate, game, null);
      event = await createOpenActivityEvent(
        {
          userId: job.user_id,
          source: "steam_library",
          eventType,
          gameId: linkedGameId,
          catalogGameId: source.catalog_game_id,
          externalId: item.app.appid,
          syncRunId: job.sync_run_id,
          dedupeKey,
          payload,
          observedAt: null,
        },
        client,
      );
    }

    const legacyReviewItem = event
      ? reviewItem(item.app, source, candidate, game, Number(event.id))
      : null;
    const result = {
      matched: !ignored && prepared?.match?.catalogGameId ? 1 : 0,
      duplicates: !ignored && prepared?.duplicate ? 1 : 0,
      filtered: !ignored && prepared?.filteredReason ? 1 : 0,
      needsReview:
        !ignored && prepared && !prepared.match?.catalogGameId ? 1 : 0,
      sourceState: before ? "updated" : "created",
      candidateState,
      candidateId: item.isNew && !ignored ? candidate?.id || null : null,
      achievementSourceId:
        source.source_status === "owned" &&
        source.game_id &&
        (activityChanged || (wasNew && nextPlaytime > 0))
          ? source.id
          : null,
      eventCreated: Boolean(event),
      reviewType: event ? reviewType : null,
      reviewItem: legacyReviewItem,
    };
    const progress = normalizeSyncProgress(runningJob.progress_json);
    for (const key of ["matched", "duplicates", "filtered", "needsReview"]) progress[key] += result[key];
    progress.sourceWrites[result.sourceState] += 1;
    progress.candidateWrites[result.candidateState] += 1;
    if (result.candidateId && !progress.newCandidateIds.includes(result.candidateId)) progress.newCandidateIds.push(result.candidateId);
    if (result.achievementSourceId && !progress.achievementSourceIds.includes(result.achievementSourceId)) progress.achievementSourceIds.push(result.achievementSourceId);
    if (result.eventCreated) progress.reviewItemsCreated += 1;
    if (result.reviewType) progress.syncReview[result.reviewType].push(result.reviewItem);
    await client.query(
      "UPDATE steam_sync_jobs SET cursor = cursor + 1, progress_json = $2::jsonb, locked_at = NOW(), updated_at = NOW() WHERE id = $1",
      [job.id, JSON.stringify(progress)],
    );
    return result;
  });
}

async function completePrivateSyncJob(job, account) {
  const summary = { total: 0, newGames: 0, activityChanged: 0, reviewItemsCreated: 0 };
  await withActiveJobLease(job, async (client) => {
    const { rows: accountRows } = await client.query(
      `
      UPDATE user_external_accounts
         SET sync_status = 'private',
             last_profile_sync_at = COALESCE(last_profile_sync_at, NOW()),
             last_error_code = 'steam_library_empty_or_private',
             last_error_message = 'Steam returned no owned games. Your game details may be private.',
             updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND disconnected_at IS NULL
       RETURNING *
      `,
      [account.id, job.user_id],
    );
    if (!accountRows[0]) throw badRequest("Linked Steam account no longer exists.");
    const runRow = await finishIntegrationSyncRun(
      job.sync_run_id,
      {
        status: "failed",
        itemsSeen: 0,
        itemsChanged: 0,
        errorsCount: 1,
        summary,
        errorCode: "steam_library_empty_or_private",
        errorMessage: "Steam returned no owned games. Your game details may be private.",
      },
      client,
    );
    const result = {
      account: serializeSteamAccount(accountRows[0]),
      total: 0,
      private: true,
      run: serializeIntegrationSyncRun(runRow),
      summary,
    };
    await client.query(
      `
      UPDATE steam_sync_jobs
         SET status = 'completed', total = 0, cursor = 0,
             result_json = $2::jsonb, completed_at = NOW(), locked_at = NULL,
             lease_token = NULL, updated_at = NOW()
       WHERE id = $1
      `,
      [job.id, JSON.stringify(result)],
    );
  });
}

async function initializeSteamSyncJob(job) {
  const account = await getSteamAccount(job.user_id);
  if (!account) throw badRequest("Linked Steam account no longer exists.");
  const existingSources = await loadSteamSources(job.user_id);
  const hasPreviousSync = hasSuccessfulSteamBaseline(account, existingSources);
  if (!job.force && hasPreviousSync) {
    const elapsed = Date.now() - new Date(account.last_library_sync_at).getTime();
    if (Number.isFinite(elapsed) && elapsed < SYNC_COOLDOWN_MS) {
      const summary = { skipped: true, reason: "cooldown" };
      await withActiveJobLease(job, async (client) => {
        const runRow = await finishIntegrationSyncRun(
          job.sync_run_id,
          { status: "skipped", summary },
          client,
        );
        const result = {
          account: serializeSteamAccount(account),
          skipped: true,
          cooldownSeconds: Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000),
          run: serializeIntegrationSyncRun(runRow),
          summary,
        };
        await client.query(
          `UPDATE steam_sync_jobs
              SET status = 'completed', result_json = $2::jsonb,
                  completed_at = NOW(), locked_at = NULL, lease_token = NULL,
                  updated_at = NOW()
            WHERE id = $1`,
          [job.id, JSON.stringify(result)],
        );
      });
      return null;
    }
  }

  const markedSyncing = await withActiveJobLease(job, async (client) => {
    const { rows } = await client.query(
      `UPDATE user_external_accounts
          SET sync_status = 'syncing', updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND disconnected_at IS NULL
        RETURNING id`,
      [account.id, job.user_id],
    );
    if (!rows[0]) throw badRequest("Linked Steam account no longer exists.");
    return true;
  });
  if (!markedSyncing.active) return null;
  const [summary, games] = await Promise.all([
    fetchPlayerSummary(account.provider_user_id).catch(() => null),
    fetchOwnedSteamGames(account.provider_user_id),
  ]);
  if (!games.length) {
    await completePrivateSyncJob(job, account);
    return null;
  }
  const diff = diffSteamLibrarySnapshot(games, existingSources);
  const payload = {
    games: diff.workItems,
    unchangedAppIds: diff.unchangedAppIds,
    itemsSeen: diff.itemsSeen,
    newGames: diff.newGames,
    activityChanged: diff.activityChanged,
    summary,
    hasPreviousSync,
  };
  const { rows } = await pool.query(
    `
    UPDATE steam_sync_jobs
       SET payload_json = $2::jsonb,
           total = $3,
           progress_json = $4::jsonb,
           locked_at = NOW(),
           updated_at = NOW()
     WHERE id = $1 AND status = 'running'
       AND lease_token = $5
     RETURNING *
    `,
    [
      job.id,
      JSON.stringify(payload),
      diff.workItems.length,
      JSON.stringify(emptySyncProgress()),
      job.lease_token,
    ],
  );
  return rows[0] || null;
}

async function finalizeSteamSyncJob(job) {
  const payload = job.payload_json || {};
  const progress = normalizeSyncProgress(job.progress_json);
  const account = await getSteamAccount(job.user_id);
  if (!account) throw badRequest("Linked Steam account no longer exists.");

  const noncriticalErrors = [];
  let autoMatch = { matched: 0, reviewed: 0 };
  if (!(await hasActiveJobLease(job))) return;
  try {
    autoMatch = await autoMatchSteamCandidates(
      { id: job.user_id },
      {
        limit: SYNC_AUTO_MATCH_LIMIT,
        useCatalogSearch: true,
        candidateIds: progress.newCandidateIds || [],
        writeGuard: async (work) => (await withActiveJobLease(job, work)).value,
      },
    );
  } catch (error) {
    noncriticalErrors.push({
      code: error?.code || "steam_auto_match_failed",
      message: error?.message || "Could not auto-match new Steam games.",
    });
  }

  let achievements = null;
  if (!(await hasActiveJobLease(job))) return;
  try {
    achievements = await syncSteamAchievementsForSourceIds(
      job.user_id,
      [...(progress.achievementSourceIds || []), ...(await listDueSteamAchievementSourceIds(job.user_id))],
      { force: Boolean(job.force), writeGuard: async (work) => (await withActiveJobLease(job, work)).value },
    );
    if (achievements.failed + achievements.unavailable > 0) {
      noncriticalErrors.push({
        code: "steam_achievements_partial",
        message: `${achievements.failed + achievements.unavailable} achievement refreshes incomplete.`,
      });
    }
  } catch (error) {
    noncriticalErrors.push({
      code: error?.code || "steam_achievements_sync_failed",
      message: error?.message || "Could not sync Steam achievements.",
    });
    achievements = {
      total: (progress.achievementSourceIds || []).length,
      failed: (progress.achievementSourceIds || []).length,
      results: [],
    };
  }

  await withActiveJobLease(job, async (client) => {
    const unchanged = payload.unchangedAppIds || [];
    if (unchanged.length) {
      await client.query(
        `
        UPDATE user_game_sources
           SET last_synced_at = NOW(), updated_at = NOW()
         WHERE user_id = $1
           AND provider = 'steam'
           AND provider_app_id = ANY($2::text[])
           AND source_status IN ('owned', 'ignored')
        `,
        [job.user_id, unchanged],
      );
    }
    const { rows: accountRows } = await client.query(
      `
      UPDATE user_external_accounts
         SET display_name = COALESCE($2, display_name),
             profile_url = COALESCE($3, profile_url),
             avatar_url = COALESCE($4, avatar_url),
             visibility_state = COALESCE($5, visibility_state),
             sync_status = 'synced',
             last_profile_sync_at = CASE
               WHEN $2::text IS NULL THEN last_profile_sync_at ELSE NOW()
             END,
             last_library_sync_at = NOW(),
             last_error_code = NULL,
             last_error_message = NULL,
             updated_at = NOW()
       WHERE id = $1 AND user_id = $6 AND disconnected_at IS NULL
       RETURNING *
      `,
      [
        account.id,
        payload.summary?.displayName || null,
        payload.summary?.profileUrl || null,
        payload.summary?.avatarUrl || null,
        payload.summary?.visibilityState ?? null,
        job.user_id,
      ],
    );
    if (!accountRows[0]) throw badRequest("Linked Steam account no longer exists.");
    const eventCount = await client.query(
      "SELECT COUNT(*)::int AS total FROM user_activity_events WHERE sync_run_id = $1",
      [job.sync_run_id],
    );
    const reviewItemsCreated = Number(eventCount.rows[0]?.total) || 0;
    const summary = {
      total:
        Number(payload.itemsSeen) ||
        Number(job.total) ||
        (payload.games || []).length,
      newlyObserved: Number(payload.newGames) || 0,
      activityChanged: Number(payload.activityChanged) || 0,
      matchingAttempted: autoMatch.reviewed || 0,
      achievementsSelected: achievements?.total || 0,
      achievementsAttempted: (achievements?.total || 0) - (achievements?.skipped || 0),
      achievementFailures: achievements?.failed || 0,
      achievementUnavailable: achievements?.unavailable || 0,
      achievementSkipped: achievements?.skipped || 0,
      reviewItemsCreated,
      librarySnapshotSucceeded: true,
      baseline: !payload.hasPreviousSync,
    };
    const status = noncriticalErrors.length ? "partial" : "succeeded";
    const runRow = await finishIntegrationSyncRun(
      job.sync_run_id,
      {
        status,
        itemsSeen: summary.total,
        itemsChanged: (payload.games || []).length,
        errorsCount: noncriticalErrors.length,
        summary: { ...summary, noncriticalErrors },
        errorCode: noncriticalErrors[0]?.code || null,
        errorMessage: noncriticalErrors[0]?.message || null,
      },
      client,
    );
    progress.syncReview.total =
      progress.syncReview.startedPlaying.length +
      progress.syncReview.statusSuggestions.length +
      progress.syncReview.newSteamGames.length;
    const result = {
      account: serializeSteamAccount(accountRows[0]),
      run: serializeIntegrationSyncRun(runRow),
      summary,
      total: summary.total,
      matched: progress.matched || 0,
      sourcesCreated: progress.sourceWrites?.created || 0,
      sourcesUpdated: progress.sourceWrites?.updated || 0,
      sourcesUnchanged:
        (progress.sourceWrites?.unchanged || 0) +
        (payload.unchangedAppIds?.length || 0),
      candidatesCreated: progress.candidateWrites?.created || 0,
      candidatesUpdated: progress.candidateWrites?.updated || 0,
      candidatesUnchanged: progress.candidateWrites?.unchanged || 0,
      autoMatched: autoMatch.matched,
      autoReviewed: autoMatch.reviewed,
      duplicates: progress.duplicates || 0,
      filtered: progress.filtered || 0,
      needsReview: progress.needsReview || 0,
      syncReview: progress.syncReview,
      achievements,
      syncedAt: nowIso(),
    };
    await client.query(
      `
      UPDATE steam_sync_jobs
         SET status = 'completed', result_json = $2::jsonb, payload_json = NULL,
             completed_at = NOW(), locked_at = NULL, lease_token = NULL,
             updated_at = NOW()
       WHERE id = $1
      `,
      [job.id, JSON.stringify(result)],
    );
  });
}

async function failSteamSyncJob(job, error) {
  if (!job?.id || !job?.lease_token) return;
  const errorCode = error?.code || "steam_sync_failed";
  const errorMessage = error?.message || "Steam sync failed.";
  const payload = job.payload_json || {};
  await withActiveJobLease(job, async (client, current) => {
    if (current.sync_run_id) {
      await finishIntegrationSyncRun(
        current.sync_run_id,
        {
          status: "failed",
          itemsSeen: Number(payload.itemsSeen) || 0,
          itemsChanged: Number(current.cursor) || 0,
          errorsCount: 1,
          summary: { librarySnapshotSucceeded: false },
          errorCode,
          errorMessage,
        },
        client,
      );
    }
    await client.query(
      `
      UPDATE steam_sync_jobs
         SET status = 'failed', error_code = $2, error_message = $3,
             completed_at = NOW(), locked_at = NULL, lease_token = NULL,
             updated_at = NOW()
       WHERE id = $1
      `,
      [job.id, errorCode, errorMessage],
    );
    if (!current.account_id) return;
    await client.query(
      `
      UPDATE user_external_accounts
         SET sync_status = 'failed', last_error_code = $2,
             last_error_message = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $4 AND disconnected_at IS NULL
      `,
      [current.account_id, errorCode, errorMessage, current.user_id],
    );
  });
}

async function processSteamSyncJob(job) {
  const stopHeartbeat = startJobLeaseHeartbeat(job);
  try {
    job = await ensureRunForJob(job);
    if (!job) return;
    // Reclaimed jobs may already have a payload. Validate eligibility before
    // doing discovery or other provider work from that saved payload.
    if (!(await withActiveJobLease(job, async () => true)).active) return;
    if (job.sync_kind === 'wishlist_prices') {
      await processSteamPriceJob(job);
      return;
    }
    if ((job.sync_kind || "library") === "wishlist") {
      await processSteamWishlistJob(job);
      return;
    }
    if (!job.payload_json) {
      job = await initializeSteamSyncJob(job);
      if (!job) return;
    }
    const games = job.payload_json?.games || [];
    const start = Number(job.cursor) || 0;
    if (start >= games.length) {
      await finalizeSteamSyncJob(job);
      return;
    }
    const end = Math.min(start + STEAM_SYNC_CHUNK_SIZE, games.length);
    for (let index = start; index < end; index += 1) {
      const storedItem = games[index];
      const item = storedItem?.app
        ? storedItem
        : {
            app: storedItem,
            kind: "legacy",
            isNew: true,
            activityChanged: true,
            firstPlayObserved: false,
          };
      const prepared = item.isNew
        ? await prepareSteamLibraryCandidate(job.user_id, item.app)
        : null;
      const result = await persistWorkItem(job, item, prepared);
      if (!result) return;

    }
    await pool.query(
      `UPDATE steam_sync_jobs
          SET locked_at = NULL, lease_token = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'running' AND lease_token = $2`,
      [job.id, job.lease_token],
    );
  } catch (error) {
    if (job?.sync_kind === 'wishlist_prices') {
      await failSteamPriceJob(job, error);
    } else if ((job?.sync_kind || "library") === "wishlist") {
      await failSteamWishlistJob(job, error);
    } else {
      await failSteamSyncJob(job, error);
    }
  } finally {
    stopHeartbeat();
  }
}

export async function enqueueSteamSync(
  userId,
  { force = false, trigger = "manual", syncKind = "library", expectedAccountId = null } = {},
) {
  await assertSteamUser(userId);
  const account = await getSteamAccount(userId);
  if (trigger === 'scheduled' && (!account?.auto_sync_enabled ||
      (expectedAccountId != null && Number(account.id) !== Number(expectedAccountId)))) return null;
  if (!account) throw badRequest("Link Steam before syncing.");
  const triggerType = trigger === "scheduled" ? "scheduled" : "manual";
  if (!['library', 'wishlist', 'wishlist_prices'].includes(syncKind)) throw badRequest('Unsupported Steam sync kind.');
  const normalizedKind = syncKind;
  const jobId = crypto.randomUUID();
  try {
    const { rows } = await pool.query(
      `
      INSERT INTO steam_sync_jobs (
        id, user_id, account_id, force, trigger_type, sync_kind, provider_user_id
      )
      SELECT $1, $2, id, $4, $5, $6, provider_user_id FROM user_external_accounts
       WHERE id = $3 AND user_id = $2 AND disconnected_at IS NULL AND provider_user_id = $7
         AND ($5 <> 'scheduled' OR auto_sync_enabled = TRUE)
      RETURNING *
      `,
      [jobId, userId, account.id, force, triggerType, normalizedKind, account.provider_user_id],
    );
    if (!rows[0]) {
      if (triggerType === 'scheduled') return null;
      throw badRequest("Steam account changed. Try again.");
    }
    queueMicrotask(() => void runSteamSyncJobs().catch(() => {}));
    return serializeSyncJob(rows[0]);
  } catch (error) {
    if (error?.code !== "23505") throw error;
    const { rows } = await pool.query(
      `SELECT *, NULL::jsonb AS sync_run
         FROM steam_sync_jobs
        WHERE user_id = $1 AND status IN ('queued', 'running')
        ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (!rows[0]) throw error;
    if ((rows[0].sync_kind || "library") !== normalizedKind) {
      if (triggerType === "scheduled") {
        await waitForSteamSyncJob(userId, rows[0].id);
        return enqueueSteamSync(userId, { force, trigger, syncKind: normalizedKind, expectedAccountId: expectedAccountId ?? account.id });
      }
      const busy = new Error("Another Steam sync is already running.");
      busy.status = 409;
      busy.code = "steam_sync_busy";
      throw busy;
    }
    if (force && !rows[0].force) {
      if (rows[0].status === "queued") {
        const upgraded = await pool.query(
          `UPDATE steam_sync_jobs SET force = TRUE, updated_at = NOW()
            WHERE id = $1 AND user_id = $2 AND status = 'queued' RETURNING *`,
          [rows[0].id, userId],
        );
        if (upgraded.rows[0]) return serializeSyncJob(upgraded.rows[0]);
      }
      const busy = new Error("The current Steam sync must finish before confirmation.");
      busy.status = 409;
      busy.code = "steam_sync_busy";
      throw busy;
    }
    return serializeSyncJob(rows[0]);
  }
}

export async function getSteamSyncJob(userId, jobId) {
  const { rows } = await pool.query(
    `
    SELECT job.*, to_jsonb(run) AS sync_run
    FROM steam_sync_jobs job
    LEFT JOIN integration_sync_runs run ON run.id = job.sync_run_id
    WHERE job.id = $1 AND job.user_id = $2
    LIMIT 1
    `,
    [jobId, userId],
  );
  return serializeSyncJob(rows[0]);
}

export async function cancelSteamSyncJob(userId, jobId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `
      UPDATE steam_sync_jobs
       SET status = 'cancelled', completed_at = NOW(), locked_at = NULL,
              lease_token = NULL, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status IN ('queued', 'running')
       RETURNING *
      `,
      [jobId, userId],
    );
    if (!rows[0]) return null;
    if (rows[0].sync_run_id) {
      await finishIntegrationSyncRun(
        rows[0].sync_run_id,
        { status: "skipped", summary: { reason: "cancelled" } },
        client,
      );
    }
    await client.query(
      `
      UPDATE user_external_accounts
         SET sync_status = CASE WHEN $3 = 'library' THEN CASE
               WHEN last_library_sync_at IS NULL THEN 'linked'
               ELSE 'synced'
             END ELSE sync_status END,
             wishlist_sync_status = CASE WHEN $3 = 'wishlist' THEN CASE
               WHEN last_wishlist_sync_at IS NULL THEN 'never'
               ELSE 'synced'
             END ELSE wishlist_sync_status END,
             price_sync_status = CASE WHEN $3 = 'wishlist_prices' THEN 'cancelled' ELSE price_sync_status END,
             price_revision = price_revision + CASE WHEN $3 = 'wishlist_prices' THEN 1 ELSE 0 END,
             updated_at = NOW()
       WHERE id = $1 AND user_id = $2
      `,
      [rows[0].account_id, userId, rows[0].sync_kind || "library"],
    );
    return serializeSyncJob(rows[0]);
  });
}

async function claimSteamSyncJob() {
  const leaseToken = crypto.randomUUID();
  const { rows } = await pool.query(
    `
    WITH candidate AS (
      SELECT id
      FROM steam_sync_jobs
      WHERE status IN ('queued', 'running')
        AND (locked_at IS NULL OR locked_at < NOW() - ($1 || ' milliseconds')::interval)
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE steam_sync_jobs job
       SET status = 'running', locked_at = NOW(),
           lease_token = $2,
           started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      FROM candidate
     WHERE job.id = candidate.id
     RETURNING job.*
    `,
    [STEAM_SYNC_JOB_LEASE_MS, leaseToken],
  );
  return rows[0] || null;
}

let steamSyncWorkerRunning = false;

export async function runSteamSyncJobs() {
  if (steamSyncWorkerRunning) return;
  steamSyncWorkerRunning = true;
  try {
    let draining = true;
    while (draining) {
      const job = await claimSteamSyncJob();
      if (!job) draining = false;
      else await processSteamSyncJob(job);
    }
  } finally {
    steamSyncWorkerRunning = false;
  }
}

export function startSteamSyncJobScheduler() {
  if (process.env.NODE_ENV === "test") return () => {};
  const run = () =>
    void runSteamSyncJobs().catch((error) => {
      console.error("Steam sync job scheduler failed:", error?.message || error);
    });
  run();
  const timer = setInterval(run, 15_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

export async function listEligibleSteamAutoSyncUsers() {
  const { rows } = await pool.query(
    `
    SELECT account.user_id, account.id AS account_id
    FROM user_external_accounts account
    JOIN users ON users.id = account.user_id
    WHERE account.provider = 'steam'
      AND account.disconnected_at IS NULL
      AND account.auto_sync_enabled = TRUE
      AND users.is_guest = FALSE
    ORDER BY account.user_id
    `,
  );
  return rows.map((row) => ({ userId: Number(row.user_id), accountId: Number(row.account_id) }));
}

export async function waitForSteamSyncJob(
  userId,
  jobId,
  { pollMs = 250, timeoutMs = STEAM_SYNC_WAIT_TIMEOUT_MS } = {},
) {
  const deadline = Date.now() + Math.max(Number(timeoutMs) || 0, 1_000);
  let job = await getSteamSyncJob(userId, jobId);
  while (job && ["queued", "running"].includes(job.status)) {
    if (Date.now() >= deadline) {
      const error = new Error("Timed out waiting for the Steam sync job.");
      error.code = "steam_sync_wait_timeout";
      throw error;
    }
    await runSteamSyncJobs();
    job = await getSteamSyncJob(userId, jobId);
    if (job && ["queued", "running"].includes(job.status)) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
  return job;
}

export async function getLinkedRunForJob(job) {
  return serializeIntegrationSyncRun(
    await getIntegrationSyncRun(job?.syncRunId || job?.sync_run_id),
  );
}
