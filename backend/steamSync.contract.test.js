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
    const { pool } = await import("./db.js");
    const user = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id",
      [`steam_contract_${crypto.randomUUID()}`],
    );
    const userId = user.rows[0].id;
    await pool.query(
      `INSERT INTO user_external_accounts
         (user_id, provider, provider_user_id, sync_status)
       VALUES ($1, 'steam', $2, 'linked')`,
      [userId, `7656119${String(userId).padStart(10, "0")}`],
    );

    let queryCount = 0;
    const originalQuery = pool.query.bind(pool);
    pool.query = (...args) => {
      queryCount += 1;
      return originalQuery(...args);
    };

    const enqueueStarted = performance.now();
    const job = await steam.enqueueSteamSync(userId, { force: true });
    const enqueueMs = performance.now() - enqueueStarted;
    assert.equal(job.status, "queued");
    assert.ok(enqueueMs < 1000, `enqueue took ${enqueueMs.toFixed(1)}ms`);

    const duplicateEnqueue = await steam.enqueueSteamSync(userId, { force: true });
    assert.equal(duplicateEnqueue.id, job.id);

    const processingStarted = performance.now();
    let current = job;
    for (let attempts = 0; attempts < 1200; attempts += 1) {
      await steam.runSteamSyncJobs();
      current = await steam.getSteamSyncJob(userId, job.id);
      if (!["queued", "running"].includes(current.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const processingMs = performance.now() - processingStarted;
    assert.equal(current.status, "completed");
    assert.equal(current.cursor, 1000);
    assert.equal(current.total, 1000);
    assert.equal(current.result.total, 1000);
    const firstSyncQueryCount = queryCount;
    assert.ok(firstSyncQueryCount < 15_000, `sync issued ${firstSyncQueryCount} queries`);

    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM user_game_sources WHERE user_id = $1) AS sources,
         (SELECT COUNT(*)::int FROM steam_import_candidates WHERE user_id = $1) AS candidates`,
      [userId],
    );
    assert.deepEqual(counts.rows[0], { sources: 1000, candidates: 1000 });

    await pool.query(
      "UPDATE user_external_accounts SET last_library_sync_at = NULL WHERE user_id = $1",
      [userId],
    );
    const retry = await steam.enqueueSteamSync(userId, { force: true });
    for (let attempts = 0; attempts < 1200; attempts += 1) {
      await steam.runSteamSyncJobs();
      current = await steam.getSteamSyncJob(userId, retry.id);
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
        JSON.stringify({ games: normalizedGames, summary: null, hasPreviousSync: true }),
        JSON.stringify({
          matched: 0,
          duplicates: 0,
          filtered: 500,
          needsReview: 500,
          sourceWrites: { created: 0, updated: 0, unchanged: 500 },
          candidateWrites: { created: 0, updated: 0, unchanged: 500 },
          syncReview: { startedPlaying: [], statusSuggestions: [], newSteamGames: [] },
        }),
      ],
    );
    await steam.runSteamSyncJobs();
    const resumed = await steam.getSteamSyncJob(userId, resumeId);
    assert.equal(resumed.status, "completed");
    assert.equal(resumed.cursor, 1000);
    const resumedCounts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM user_game_sources WHERE user_id = $1) AS sources,
         (SELECT COUNT(*)::int FROM steam_import_candidates WHERE user_id = $1) AS candidates`,
      [userId],
    );
    assert.deepEqual(resumedCounts.rows[0], { sources: 1000, candidates: 1000 });

    await pool.query(
      "UPDATE user_external_accounts SET last_library_sync_at = NULL WHERE user_id = $1",
      [userId],
    );
    const cancellable = await steam.enqueueSteamSync(userId, { force: true });
    let running = cancellable;
    for (let attempts = 0; attempts < 200; attempts += 1) {
      running = await steam.getSteamSyncJob(userId, cancellable.id);
      if (running.status === "running") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(running.status, "running");
    const cancelled = await steam.cancelSteamSyncJob(userId, cancellable.id);
    assert.equal(cancelled.status, "cancelled");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal((await steam.getSteamSyncJob(userId, cancellable.id)).status, "cancelled");

    await pool.query(
      "UPDATE user_external_accounts SET last_library_sync_at = NOW() WHERE user_id = $1",
      [userId],
    );
    const cooldown = await steam.enqueueSteamSync(userId, { force: false });
    let cooldownResult = cooldown;
    for (let attempts = 0; attempts < 200; attempts += 1) {
      await steam.runSteamSyncJobs();
      cooldownResult = await steam.getSteamSyncJob(userId, cooldown.id);
      if (!["queued", "running"].includes(cooldownResult.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(cooldownResult.status, "completed");
    assert.equal(cooldownResult.result.skipped, true);

    process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({ response: { games: [] } });
    const privateUser = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id",
      [`steam_private_${crypto.randomUUID()}`],
    );
    const privateUserId = privateUser.rows[0].id;
    await pool.query(
      `INSERT INTO user_external_accounts
         (user_id, provider, provider_user_id, sync_status)
       VALUES ($1, 'steam', $2, 'linked')`,
      [privateUserId, `7656120${String(privateUserId).padStart(10, "0")}`],
    );
    const privateJob = await steam.enqueueSteamSync(privateUserId, { force: true });
    let privateResult = privateJob;
    for (let attempts = 0; attempts < 200; attempts += 1) {
      await steam.runSteamSyncJobs();
      privateResult = await steam.getSteamSyncJob(privateUserId, privateJob.id);
      if (!["queued", "running"].includes(privateResult.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(privateResult.status, "completed");
    assert.equal(privateResult.result.private, true);
    assert.equal(
      (await pool.query("SELECT sync_status FROM user_external_accounts WHERE user_id = $1", [privateUserId])).rows[0].sync_status,
      "private",
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
