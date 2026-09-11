import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const adminUrl =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/game_backlog";

async function createTemporaryDatabase() {
  const database = `steam_contract_${crypto.randomUUID().replaceAll("-", "")}`;
  const target = new URL(adminUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("Contract tests require localhost");
  target.pathname = `/${database}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  return {
    database,
    url: target.toString(),
    async cleanup() {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
        [database],
      ).catch(() => {});
      await admin.query(`DROP DATABASE IF EXISTS ${database}`).catch(() => {});
      await admin.end();
    },
  };
}

async function migrate(url) {
  await execFileAsync(
    process.execPath,
    [path.join(root, "scripts", "db-migrate.js")],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url, PGSSL: "false" },
    },
  );
}

function generatedLibrary(size) {
  return {
    response: {
      games: Array.from({ length: size }, (_, index) => ({
        appid: 100_000 + index,
        name: `Generated App ${index + 1} Soundtrack`,
        playtime_forever: index % 600,
        rtime_last_played: 1_700_000_000 + index,
      })),
    },
  };
}

test("durable Steam sync processes 1,000 apps asynchronously and idempotently", { timeout: 120_000 }, async () => {
  const temporary = await createTemporaryDatabase();
  try {
    await migrate(temporary.url);
    process.env.DATABASE_URL = temporary.url;
    process.env.PGSSL = "false";
    process.env.NODE_ENV = "test";
    process.env.STEAM_SYNC_CHUNK_SIZE = "100";
    process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify(generatedLibrary(1000));
    process.env.STEAM_MOCK_PLAYER_SUMMARY_JSON = JSON.stringify({
      response: { players: [] },
    });

    const steam = await import("./services/steamService.js");
    const steamSync = await import("./services/steamLibrarySyncService.js");
    const activity = await import("./services/activityEventService.js");
    const { pool } = await import("./db.js");
    const user = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id",
      [`steam_contract_${crypto.randomUUID()}`],
    );
    const userId = user.rows[0].id;
    await pool.query(
      `INSERT INTO user_external_accounts
         (user_id, provider, provider_user_id, sync_status, auto_sync_enabled)
       VALUES ($1, 'steam', $2, 'linked', TRUE)`,
      [userId, `7656119${String(userId).padStart(10, "0")}`],
    );

    let queryCount = 0;
    const originalQuery = pool.query.bind(pool);
    pool.query = (...args) => {
      queryCount += 1;
      return originalQuery(...args);
    };
    const finishJob = async (queued, attempts = 1200) => {
      let terminal = queued;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        await steamSync.runSteamSyncJobs();
        terminal = await steamSync.getSteamSyncJob(userId, queued.id);
        if (!['queued', 'running'].includes(terminal.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return terminal;
    };

    const enqueueStarted = performance.now();
    const job = await steamSync.enqueueSteamSync(userId, { force: true });
    const enqueueMs = performance.now() - enqueueStarted;
    assert.equal(job.status, "queued");
    assert.ok(enqueueMs < 1000, `enqueue took ${enqueueMs.toFixed(1)}ms`);

    const duplicateEnqueue = await steamSync.enqueueSteamSync(userId, { force: true });
    assert.equal(duplicateEnqueue.id, job.id);

    const processingStarted = performance.now();
    let current = job;
    for (let attempts = 0; attempts < 1200; attempts += 1) {
      await steamSync.runSteamSyncJobs();
      current = await steamSync.getSteamSyncJob(userId, job.id);
      if (!["queued", "running"].includes(current.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const processingMs = performance.now() - processingStarted;
    assert.equal(current.status, "completed");
    assert.equal(current.cursor, 1000);
    assert.equal(current.total, 1000);
    assert.equal(current.result.total, 1000);
    assert.equal(current.run.triggerType, "manual");
    assert.equal(current.run.status, "succeeded");
    const firstSyncQueryCount = queryCount;
    assert.ok(firstSyncQueryCount < 15_000, `sync issued ${firstSyncQueryCount} queries`);

    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM user_game_sources WHERE user_id = $1) AS sources,
         (SELECT COUNT(*)::int FROM steam_import_candidates WHERE user_id = $1) AS candidates`,
      [userId],
    );
    assert.deepEqual(counts.rows[0], { sources: 1000, candidates: 1000 });
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT COUNT(*) FROM user_activity_events WHERE user_id = $1",
            [userId],
          )
        ).rows[0].count,
      ),
      0,
    );

    await pool.query(
      "UPDATE user_external_accounts SET last_library_sync_at = NULL WHERE user_id = $1",
      [userId],
    );
    const retry = await steamSync.enqueueSteamSync(userId, { force: true });
    for (let attempts = 0; attempts < 1200; attempts += 1) {
      await steamSync.runSteamSyncJobs();
      current = await steamSync.getSteamSyncJob(userId, retry.id);
      if (!["queued", "running"].includes(current.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(current.status, "completed");
    const retryCounts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM user_game_sources WHERE user_id = $1) AS sources,
         (SELECT COUNT(*)::int FROM steam_import_candidates WHERE user_id = $1) AS candidates`,
      [userId],
    );
    assert.deepEqual(retryCounts.rows[0], { sources: 1000, candidates: 1000 });

    const account = await pool.query(
      "SELECT id FROM user_external_accounts WHERE user_id = $1",
      [userId],
    );
    const resumeId = crypto.randomUUID();
    const normalizedGames = steam.normalizeOwnedGamesPayload(generatedLibrary(1000));
    await pool.query(
      `INSERT INTO steam_sync_jobs
         (id, user_id, account_id, status, force, cursor, total,
          payload_json, progress_json, locked_at, started_at)
       VALUES ($1, $2, $3, 'running', TRUE, 500, 1000, $4::jsonb, $5::jsonb,
               NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes')`,
      [
        resumeId,
        userId,
        account.rows[0].id,
        JSON.stringify({
          games: normalizedGames,
          summary: null,
          hasPreviousSync: true,
        }),
        JSON.stringify({
          matched: 0,
          duplicates: 0,
          filtered: 500,
          needsReview: 500,
          sourceWrites: { created: 0, updated: 0, unchanged: 500 },
          candidateWrites: { created: 0, updated: 0, unchanged: 500 },
          syncReview: {
            startedPlaying: [],
            statusSuggestions: [],
            newSteamGames: [
              { steamAppId: "legacy-review", steamName: "Legacy Review" },
            ],
          },
        }),
      ],
    );
    await steamSync.runSteamSyncJobs();
    const resumed = await steamSync.getSteamSyncJob(userId, resumeId);
    assert.equal(resumed.status, "completed");
    assert.equal(resumed.cursor, 1000);
    const resumedCounts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM user_game_sources WHERE user_id = $1) AS sources,
         (SELECT COUNT(*)::int FROM steam_import_candidates WHERE user_id = $1) AS candidates`,
      [userId],
    );
    assert.deepEqual(resumedCounts.rows[0], { sources: 1000, candidates: 1000 });
    const legacyEvents = await activity.listActivityEvents(userId, {
      source: "steam_library",
      state: "open",
    });
    assert.equal(legacyEvents.events.length, 1);
    assert.equal(legacyEvents.events[0].externalId, "legacy-review");
    await activity.updateActivityEvent(
      userId,
      legacyEvents.events[0].id,
      "dismiss",
    );

    await pool.query(
      "UPDATE user_external_accounts SET last_library_sync_at = NULL WHERE user_id = $1",
      [userId],
    );
    const cancellable = await steamSync.enqueueSteamSync(userId, { force: true });
    let running = cancellable;
    for (let attempts = 0; attempts < 200; attempts += 1) {
      running = await steamSync.getSteamSyncJob(userId, cancellable.id);
      if (running.status === "running") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(running.status, "running");
    const cancelled = await steamSync.cancelSteamSyncJob(userId, cancellable.id);
    assert.equal(cancelled.status, "cancelled");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const cancelledAfterWorker = await steamSync.getSteamSyncJob(
      userId,
      cancellable.id,
    );
    assert.equal(cancelledAfterWorker.status, "cancelled");
    assert.equal(cancelledAfterWorker.run.status, "skipped");
    assert.equal(
      (
        await pool.query(
          "SELECT last_library_sync_at FROM user_external_accounts WHERE user_id = $1 AND disconnected_at IS NULL",
          [userId],
        )
      ).rows[0].last_library_sync_at,
      null,
    );

    await pool.query(
      "UPDATE user_external_accounts SET last_library_sync_at = NOW() WHERE user_id = $1",
      [userId],
    );
    const cooldown = await steamSync.enqueueSteamSync(userId, { force: false });
    let cooldownResult = cooldown;
    for (let attempts = 0; attempts < 200; attempts += 1) {
      await steamSync.runSteamSyncJobs();
      cooldownResult = await steamSync.getSteamSyncJob(userId, cooldown.id);
      if (!["queued", "running"].includes(cooldownResult.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(cooldownResult.status, "completed");
    assert.equal(cooldownResult.result.skipped, true);

    const catalog = await pool.query(
      "INSERT INTO catalog_games (name) VALUES ('Incremental Game') RETURNING id",
    );
    await pool.query(
      `INSERT INTO external_game_ids (catalog_game_id, source, external_id)
       VALUES ($1, 'steam', '999999')`,
      [catalog.rows[0].id],
    );
    const incrementalLibrary = generatedLibrary(1000);
    incrementalLibrary.response.games.push({
      appid: 999999,
      name: "Incremental Game",
      playtime_forever: 0,
    });
    process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify(incrementalLibrary);
    const incremental = await finishJob(
      await steamSync.enqueueSteamSync(userId, {
        force: true,
        trigger: "scheduled",
      }),
    );
    assert.equal(incremental.status, "completed");
    assert.equal(incremental.run.triggerType, "scheduled");
    assert.equal(incremental.result.summary.newlyObserved, 1);
    let openEvents = await activity.listActivityEvents(userId, {
      source: "steam_library",
      state: "open",
    });
    assert.equal(openEvents.events.length, 1);
    assert.equal(openEvents.events[0].eventType, "steam_new_game");

    const identicalIncremental = await finishJob(
      await steamSync.enqueueSteamSync(userId, { force: true }),
    );
    assert.equal(identicalIncremental.result.summary.newlyObserved, 0);
    openEvents = await activity.listActivityEvents(userId, {
      source: "steam_library",
      state: "open",
    });
    assert.equal(openEvents.events.length, 1);

    await activity.updateActivityEvent(userId, openEvents.events[0].id, "dismiss");
    await pool.query(
      `UPDATE user_game_sources
          SET source_status = 'ignored'
        WHERE user_id = $1 AND provider = 'steam' AND provider_app_id = '999999'`,
      [userId],
    );
    incrementalLibrary.response.games.at(-1).playtime_forever = 20;
    process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify(incrementalLibrary);
    const ignoredChange = await finishJob(
      await steamSync.enqueueSteamSync(userId, { force: true }),
    );
    assert.equal(ignoredChange.result.summary.activityChanged, 1);
    openEvents = await activity.listActivityEvents(userId, {
      source: "steam_library",
      state: "open",
    });
    assert.equal(openEvents.events.length, 0);

    const reconnectUser = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id",
      [`steam_reconnect_${crypto.randomUUID()}`],
    );
    const reconnectUserId = reconnectUser.rows[0].id;
    const reconnectSteamId = `7656121${String(reconnectUserId).padStart(10, "0")}`;
    await pool.query(
      `INSERT INTO user_external_accounts
         (user_id, provider, provider_user_id, sync_status, last_library_sync_at)
       VALUES ($1, 'steam', $2, 'synced', NOW())`,
      [reconnectUserId, reconnectSteamId],
    );
    await pool.query(
      `INSERT INTO user_game_sources
         (user_id, provider, provider_app_id, relationship, source_status,
          playtime_minutes_forever, last_synced_at)
       VALUES ($1, 'steam', '424242', 'owned', 'ignored', 10, NOW())`,
      [reconnectUserId],
    );
    await pool.query(
      `INSERT INTO steam_import_candidates
         (user_id, steam_app_id, steam_name, import_status,
          suggested_status, suggested_status_reason)
       VALUES ($1, '424242', 'Ignored Across Relink', 'ignored',
               'plan to play', 'Preserve ignored suggestion state')`,
      [reconnectUserId],
    );
    await steam.disconnectSteamAccount(reconnectUserId);
    await steam.upsertSteamAccount(reconnectUserId, reconnectSteamId);
    process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({
      response: {
        games: [
          {
            appid: 424242,
            name: "Ignored Across Relink",
            playtime_forever: 25,
            rtime_last_played: 1_800_000_000,
          },
        ],
      },
    });
    const reconnectJob = await steamSync.enqueueSteamSync(reconnectUserId, {
      force: true,
    });
    let reconnectResult = reconnectJob;
    for (let attempts = 0; attempts < 200; attempts += 1) {
      await steamSync.runSteamSyncJobs();
      reconnectResult = await steamSync.getSteamSyncJob(
        reconnectUserId,
        reconnectJob.id,
      );
      if (!["queued", "running"].includes(reconnectResult.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(reconnectResult.status, "completed");
    const reconnectState = await pool.query(
      `SELECT source.source_status, candidate.import_status,
              candidate.suggested_status, candidate.suggested_status_reason
         FROM user_game_sources source
         JOIN steam_import_candidates candidate
           ON candidate.user_id = source.user_id
          AND candidate.steam_app_id = source.provider_app_id
        WHERE source.user_id = $1 AND source.provider_app_id = '424242'`,
      [reconnectUserId],
    );
    assert.deepEqual(reconnectState.rows[0], {
      source_status: "ignored",
      import_status: "ignored",
      suggested_status: "plan to play",
      suggested_status_reason: "Preserve ignored suggestion state",
    });
    assert.equal(
      (
        await activity.listActivityEvents(reconnectUserId, {
          source: "steam_library",
          state: "open",
        })
      ).events.length,
      0,
    );

    const suggestionGame = await pool.query(
      `INSERT INTO games (user_id, name, status)
       VALUES ($1, 'Status Suggestion Contract', 'plan to play')
       RETURNING id`,
      [userId],
    );
    await pool.query(
      `INSERT INTO user_game_sources
         (user_id, game_id, provider, provider_app_id, relationship, source_status, last_synced_at)
       VALUES ($1, $2, 'steam', 'status-contract', 'owned', 'owned', NOW())`,
      [userId, suggestionGame.rows[0].id],
    );
    const suggestionRun = (await pool.query("SELECT sync_run_id FROM steam_sync_jobs WHERE user_id=$1 AND sync_run_id IS NOT NULL ORDER BY created_at DESC LIMIT 1", [userId])).rows[0].sync_run_id;
    const suggestionEvent = await activity.createOpenActivityEvent({
      userId,
      source: "steam_library",
      eventType: "steam_status_suggestion",
      gameId: suggestionGame.rows[0].id,
      externalId: "status-contract",
      syncRunId: suggestionRun,
      dedupeKey: "status-suggestion:status-contract:plan to play",
      payload: {
        currentStatus: "plan to play",
        steamAppId: "status-contract",
        gameId: suggestionGame.rows[0].id,
      },
    });
    const appliedSuggestion = await steam.applySteamStatusSuggestion(
      userId,
      suggestionGame.rows[0].id,
      {
        status: "playing",
        setStartedAt: false,
        activityEventId: suggestionEvent.id,
      },
    );
    assert.equal(appliedSuggestion.game.status, "playing");
    assert.equal(appliedSuggestion.game.startedAt, null);
    assert.equal(appliedSuggestion.activityEventResolved, true);
    assert.equal(
      (
        await activity.listActivityEvents(userId, {
          source: "steam_library",
          state: "resolved",
        })
      ).events.some((event) => event.id === Number(suggestionEvent.id)),
      true,
    );

    process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({ response: { games: [] } });
    const privateUser = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id",
      [`steam_private_${crypto.randomUUID()}`],
    );
    const privateUserId = privateUser.rows[0].id;
    await pool.query(
      `INSERT INTO user_external_accounts
         (user_id, provider, provider_user_id, sync_status, auto_sync_enabled)
       VALUES ($1, 'steam', $2, 'linked', TRUE)`,
      [privateUserId, `7656120${String(privateUserId).padStart(10, "0")}`],
    );
    const privateJob = await steamSync.enqueueSteamSync(privateUserId, { force: true });
    let privateResult = privateJob;
    for (let attempts = 0; attempts < 200; attempts += 1) {
      await steamSync.runSteamSyncJobs();
      privateResult = await steamSync.getSteamSyncJob(privateUserId, privateJob.id);
      if (!["queued", "running"].includes(privateResult.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(privateResult.status, "completed");
    assert.equal(privateResult.result.private, true);
    assert.equal(
      (
        await pool.query(
          "SELECT sync_status, last_library_sync_at FROM user_external_accounts WHERE user_id = $1",
          [privateUserId],
        )
      ).rows[0].sync_status,
      "private",
    );
    assert.equal(
      (
        await pool.query(
          "SELECT last_library_sync_at FROM user_external_accounts WHERE user_id = $1",
          [privateUserId],
        )
      ).rows[0].last_library_sync_at,
      null,
    );

    await assert.rejects(
      pool.query(
        "INSERT INTO steam_sync_jobs (id, user_id, status) VALUES ($1, $2, 'unknown')",
        [crypto.randomUUID(), privateUserId],
      ),
      (error) => error.code === "23514",
    );
    const cleanupJobId = crypto.randomUUID();
    await pool.query(
      "INSERT INTO steam_sync_jobs (id, user_id, status) VALUES ($1, $2, 'completed')",
      [cleanupJobId, privateUserId],
    );
    await pool.query("DELETE FROM users WHERE id = $1", [privateUserId]);
    assert.equal(
      Number((await pool.query("SELECT COUNT(*) FROM steam_sync_jobs WHERE id = $1", [cleanupJobId])).rows[0].count),
      0,
    );

    await pool.end();
    process.stdout.write(
      `Steam 1k contract: enqueue=${enqueueMs.toFixed(1)}ms process=${processingMs.toFixed(1)}ms firstSyncQueries=${firstSyncQueryCount}\n`,
    );
  } finally {
    await temporary.cleanup();
  }
});
