import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

dotenv.config();

test("activity foundation migration preserves and classifies retained observations", { timeout: 120_000 }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const database = `activity_foundation_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  url.pathname = `/${database}`;
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  let appPool;
  try {
    await client.query(`CREATE TABLE schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const migrationsDirectory = path.resolve("backend/migrations");
    const legacyMigrations = (await fs.readdir(migrationsDirectory))
      .filter((file) => /^\d+_.+\.sql$/.test(file) && file < "049_add_activity_foundation.sql")
      .sort();
    for (const file of legacyMigrations) {
      await client.query("BEGIN");
      try {
        await client.query(await fs.readFile(path.join(migrationsDirectory, file), "utf8"));
        await client.query("INSERT INTO schema_migrations(filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    const userId = (await client.query(
      "INSERT INTO users(username, password_hash) VALUES ('activity-owner', 'x') RETURNING id",
    )).rows[0].id;
    const otherUserId = (await client.query(
      "INSERT INTO users(username, password_hash) VALUES ('activity-other-owner', 'x') RETURNING id",
    )).rows[0].id;
    const gameId = (await client.query(
      "INSERT INTO games(user_id, name, status) VALUES ($1, 'Hades', 'plan to play') RETURNING id",
      [userId],
    )).rows[0].id;
    const sourceId = (await client.query(
      `INSERT INTO user_game_sources
        (user_id, game_id, provider, provider_app_id, playtime_minutes_forever,
         first_play_observed_at, last_synced_at)
       VALUES ($1, $2, 'steam', '1145360', 2600, '2026-09-19T02:00:00Z', '2026-09-23T02:00:00Z')
       RETURNING id`,
      [userId, gameId],
    )).rows[0].id;
    const firstAccountId = (await client.query(
      `INSERT INTO user_external_accounts
        (user_id, provider, provider_user_id, linked_at, disconnected_at)
       VALUES ($1, 'steam', '76561190000000001', '2026-09-01T00:00:00Z', '2026-09-23T03:00:00Z') RETURNING id`,
      [userId],
    )).rows[0].id;
    const secondAccountId = (await client.query(
      `INSERT INTO user_external_accounts(user_id, provider, provider_user_id, linked_at, last_library_sync_at)
       VALUES ($1, 'steam', '76561190000000002', '2026-09-23T03:00:00Z', '2026-09-24T02:00:00Z') RETURNING id`,
      [userId],
    )).rows[0].id;

    const snapshots = [
      [firstAccountId, "76561190000000001", "2026-09-18T02:00:00Z", 2400, 0],
      [firstAccountId, "76561190000000001", "2026-09-19T02:00:00Z", 2520, 120],
      [firstAccountId, "76561190000000001", "2026-09-22T02:00:00Z", 2705, 185],
      [firstAccountId, "76561190000000001", "2026-09-23T02:00:00Z", 2600, 0],
      [secondAccountId, "76561190000000002", "2026-09-24T02:00:00Z", 40, 0],
    ];
    const runIds = [];
    for (let index = 0; index < snapshots.length; index += 1) {
      const [accountId, providerUserId, snapshotObservedAt, total, delta] = snapshots[index];
      const runId = (await client.query(
        `INSERT INTO integration_sync_runs
          (user_id, provider, sync_kind, trigger_type, status, finished_at)
         VALUES ($1, 'steam', 'library', 'scheduled', 'succeeded', $2::timestamptz + INTERVAL '2 hours')
         RETURNING id`,
        [userId, snapshotObservedAt],
      )).rows[0].id;
      runIds.push(runId);
      await client.query(
        `INSERT INTO steam_sync_jobs
          (id, user_id, account_id, provider_user_id, trigger_type, sync_kind,
           sync_run_id, status, payload_json, completed_at)
         VALUES ($1, $2, $3, $4, 'scheduled', 'library', $5, 'completed',
           jsonb_build_object('snapshotObservedAt', $6::text), $6::timestamptz + INTERVAL '2 hours')`,
        [crypto.randomUUID(), userId, accountId, providerUserId, runId, snapshotObservedAt],
      );
      await client.query(
        `INSERT INTO steam_activity_observations
          (user_id, sync_run_id, source_id, game_id, steam_app_id, game_name,
           playtime_minutes_forever, playtime_delta_minutes, interval_started_at,
           observed_at, is_baseline)
         VALUES ($1, $2, $3, $4, '1145360', 'Hades', $5, $6,
           CASE WHEN $7::int = 0 THEN NULL ELSE $8::timestamptz + INTERVAL '2 hours' END,
           $9::timestamptz + INTERVAL '2 hours', $7::int = 0)`,
        [
          userId,
          runId,
          sourceId,
          gameId,
          total,
          delta,
          index === 0 || index === 4 ? 0 : 1,
          index ? snapshots[index - 1][2] : snapshotObservedAt,
          snapshotObservedAt,
        ],
      );
    }
    const historicNewSourceId = (await client.query(
      `INSERT INTO user_game_sources
        (user_id, provider, provider_app_id, playtime_minutes_forever,
         first_play_observed_at, first_play_observed_playtime_minutes,
         ownership_observed_run_id, last_synced_at)
       VALUES ($1, 'steam', 'historic-new-app', 25, '2026-09-19T02:00:00Z',
         25, $2, '2026-09-19T02:00:00Z') RETURNING id`,
      [userId, runIds[1]],
    )).rows[0].id;
    await client.query(
      `INSERT INTO steam_activity_observations
        (user_id, sync_run_id, source_id, steam_app_id, game_name,
         playtime_minutes_forever, playtime_delta_minutes, observed_at, is_baseline)
       VALUES ($1, $2, $3, 'historic-new-app', 'Historic new app', 25, 0,
         '2026-09-19T04:00:00Z', TRUE)`,
      [userId, runIds[1], historicNewSourceId],
    );
    await client.query(
      `INSERT INTO user_activity_events
        (user_id, source, event_type, game_id, external_id, sync_run_id,
         dedupe_key, payload_json, observed_at)
       VALUES ($1, 'steam_library', 'steam_status_suggestion', $2, '1145360', $3,
         'status-suggestion:1145360:plan to play',
         '{"firstPlayObservedAt":"2026-09-19T02:00:00.000Z"}',
         '2026-09-19T04:00:00Z')`,
      [userId, gameId, runIds[1]],
    );

    const legacySourceId = (await client.query(
      `INSERT INTO user_game_sources
        (user_id, provider, provider_app_id, playtime_minutes_forever,
         achievements_unlocked, achievements_total)
       VALUES ($1, 'steam', 'legacy-gap', 20, 7, 20) RETURNING id`,
      [userId],
    )).rows[0].id;
    for (const [observedAt, total, delta, baseline] of [
      ["2026-08-18T04:00:00Z", 10, 0, true],
      ["2026-08-20T04:00:00Z", 20, 10, false],
    ]) {
      const runId = (await client.query(
        `INSERT INTO integration_sync_runs
          (user_id, provider, sync_kind, trigger_type, status, finished_at)
         VALUES ($1, 'steam', 'library', 'scheduled', 'succeeded', $2) RETURNING id`,
        [userId, observedAt],
      )).rows[0].id;
      await client.query(
        `INSERT INTO steam_sync_jobs
          (id, user_id, account_id, provider_user_id, trigger_type, sync_kind,
           sync_run_id, status, payload_json, completed_at)
         VALUES ($1, $2, $3, '76561190000000001', 'scheduled', 'library', $4,
           'completed', '{}'::jsonb, $5)`,
        [crypto.randomUUID(), userId, firstAccountId, runId, observedAt],
      );
      await client.query(
        `INSERT INTO steam_activity_observations
          (user_id, sync_run_id, source_id, steam_app_id, game_name,
           playtime_minutes_forever, playtime_delta_minutes, interval_started_at,
           observed_at, is_baseline)
         VALUES ($1, $2, $3, 'legacy-gap', 'Legacy gap', $4, $5,
           CASE WHEN $6 THEN NULL ELSE '2026-08-18T04:00:00Z'::timestamptz END,
           $7, $6)`,
        [userId, runId, legacySourceId, total, delta, baseline, observedAt],
      );
    }

    const migrationStartedAt = Date.now();
    await promisify(execFile)(process.execPath, ["scripts/db-migrate.js"], {
      env: { ...process.env, DATABASE_URL: url.href, PGSSL: "false" },
    });
    await promisify(execFile)(process.execPath, ["scripts/db-migrate.js"], {
      env: { ...process.env, DATABASE_URL: url.href, PGSSL: "false" },
    });
    const migrationRuntimeMs = Date.now() - migrationStartedAt;
    assert.ok(migrationRuntimeMs < 30_000, `disposable migration pair took ${migrationRuntimeMs}ms`);
    console.log(`Activity migration contract: two runner passes completed in ${migrationRuntimeMs}ms`);

    const { rows } = await client.query(
      `SELECT observed_at, interval_started_at, activity_precision, activity_day::text AS activity_day,
        observation_time_source, counter_rebaseline, is_baseline,
        playtime_delta_minutes
       FROM steam_activity_observations WHERE steam_app_id <> 'legacy-gap' ORDER BY id`,
    );
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.map((row) => row.activity_precision), [
      "baseline", "daily", "uncertain", "daily", "baseline", "daily",
    ]);
    assert.deepEqual(rows.map((row) => row.activity_day || null), [
      null, "2026-09-18", null, "2026-09-22", null, "2026-09-18",
    ]);
    assert.ok(rows.every((row) => row.observation_time_source === "snapshot"));
    assert.equal(rows[1].observed_at.toISOString(), "2026-09-19T02:00:00.000Z");
    assert.equal(rows[1].interval_started_at.toISOString(), "2026-09-18T02:00:00.000Z");
    assert.equal(rows[3].counter_rebaseline, true);
    assert.equal(rows[3].playtime_delta_minutes, 0);
    assert.equal(rows[4].is_baseline, true);
    assert.equal(rows[5].is_baseline, false);
    assert.equal(rows[5].playtime_delta_minutes, 25);
    assert.equal(
      (await client.query("SELECT first_play_activity_day::text FROM user_game_sources WHERE id = $1", [sourceId])).rows[0]
        .first_play_activity_day,
      "2026-09-18",
    );
    assert.equal(
      (await client.query("SELECT payload_json->>'activityDay' AS day FROM user_activity_events")).rows[0].day,
      "2026-09-18",
    );
    assert.equal(
      (await client.query("SELECT COUNT(*)::int AS count FROM schema_migrations WHERE filename = '049_add_activity_foundation.sql'")).rows[0].count,
      1,
    );
    assert.equal(
      (await client.query("SELECT COUNT(*)::int AS count FROM schema_migrations WHERE filename = '051_add_steam_activity_allocations.sql'")).rows[0].count,
      1,
    );
    const legacyRows = (await client.query(
      `SELECT observation_time_source, activity_precision, activity_day::text,
         playtime_minutes_forever, playtime_delta_minutes
       FROM steam_activity_observations WHERE steam_app_id = 'legacy-gap' ORDER BY observed_at`,
    )).rows;
    assert.deepEqual(legacyRows.map((row) => row.observation_time_source), ["legacy_finalization", "legacy_finalization"]);
    assert.deepEqual(legacyRows.map((row) => row.activity_precision), ["baseline", "uncertain"]);
    assert.deepEqual(legacyRows.map((row) => row.playtime_minutes_forever), [10, 20]);
    assert.equal(legacyRows[1].playtime_delta_minutes, 10);
    assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM steam_achievement_unlocks")).rows[0].count, 0);
    assert.ok((await client.query(
      "SELECT achievement_events_baseline_at FROM user_game_sources WHERE id = $1", [sourceId],
    )).rows[0].achievement_events_baseline_at);
    assert.equal((await client.query(
      `SELECT COUNT(*)::int AS count FROM user_activity_events
       WHERE event_type IN ('steam_added_to_library', 'steam_first_played', 'steam_returned', 'steam_achievement_unlocked')`,
    )).rows[0].count, 0);
    assert.equal((await client.query(
      "SELECT last_library_sync_at FROM user_external_accounts WHERE id = $1", [secondAccountId],
    )).rows[0].last_library_sync_at.toISOString(), "2026-09-24T02:00:00.000Z");
    await client.query(
      "UPDATE user_game_sources SET source_status = 'disconnected' WHERE id = ANY($1::int[])",
      [[historicNewSourceId, legacySourceId]],
    );

    const runtimeSnapshot = "2026-09-25T02:00:00.000Z";
    const runtimeRunId = (await client.query(
      `INSERT INTO integration_sync_runs
        (user_id, provider, sync_kind, trigger_type, status)
       VALUES ($1, 'steam', 'library', 'scheduled', 'running') RETURNING id`,
      [userId],
    )).rows[0].id;
    await client.query(
      `INSERT INTO steam_sync_jobs
        (id, user_id, account_id, provider_user_id, trigger_type, sync_kind,
         sync_run_id, status, payload_json)
       VALUES ($1, $2, $3, '76561190000000002', 'scheduled', 'library', $4,
         'running', jsonb_build_object('snapshotObservedAt', $5::text))`,
      [crypto.randomUUID(), userId, secondAccountId, runtimeRunId, runtimeSnapshot],
    );
    await client.query(
      "UPDATE user_game_sources SET playtime_minutes_forever = 130 WHERE id = $1",
      [sourceId],
    );
    await client.query(
      `INSERT INTO user_game_sources
        (user_id, provider, provider_app_id, playtime_minutes_forever,
         first_play_observed_at, first_play_observed_playtime_minutes,
         ownership_observed_run_id, last_synced_at)
       VALUES ($1, 'steam', 'new-app', 30, $2, 30, $3, $2)`,
      [userId, runtimeSnapshot, runtimeRunId],
    );
    Object.assign(process.env, { DATABASE_URL: url.href, PGSSL: "false", NODE_ENV: "test" });
    const activity = await import("./services/steamActivityService.js");
    ({ pool: appPool } = await import("./db.js"));
    const recorded = await activity.recordSteamActivityObservations(
      { userId, syncRunId: runtimeRunId, snapshotObservedAt: runtimeSnapshot },
      client,
    );
    assert.deepEqual(recorded, {
      recorded: 2,
      baselines: 0,
      daily: 2,
      uncertain: 0,
      counterRebaselines: 0,
      activityChanged: 2,
    });
    const runtimeRow = (await client.query(
      `SELECT observed_at, activity_precision, activity_day::text,
        playtime_delta_minutes
       FROM steam_activity_observations WHERE sync_run_id = $1 AND steam_app_id = '1145360'`,
      [runtimeRunId],
    )).rows[0];
    assert.equal(runtimeRow.observed_at.toISOString(), runtimeSnapshot);
    assert.equal(runtimeRow.activity_precision, "daily");
    assert.equal(runtimeRow.activity_day, "2026-09-24");
    assert.equal(runtimeRow.playtime_delta_minutes, 90);
    const newAppRow = (await client.query(
      `SELECT is_baseline, activity_precision, activity_day::text,
        playtime_delta_minutes, interval_started_at
       FROM steam_activity_observations
       WHERE sync_run_id = $1 AND steam_app_id = 'new-app'`,
      [runtimeRunId],
    )).rows[0];
    assert.equal(newAppRow.is_baseline, false);
    assert.equal(newAppRow.activity_precision, "daily");
    assert.equal(newAppRow.activity_day, "2026-09-24");
    assert.equal(newAppRow.playtime_delta_minutes, 30);
    assert.equal(newAppRow.interval_started_at.toISOString(), "2026-09-24T02:00:00.000Z");
    assert.equal(
      (await activity.recordSteamActivityObservations(
        { userId, syncRunId: runtimeRunId, snapshotObservedAt: runtimeSnapshot },
        client,
      )).recorded,
      0,
    );
    await client.query(
      "UPDATE steam_sync_jobs SET status = 'completed', completed_at = NOW() WHERE sync_run_id = $1",
      [runtimeRunId],
    );
    await client.query(
      "UPDATE integration_sync_runs SET status = 'succeeded', finished_at = NOW() WHERE id = $1",
      [runtimeRunId],
    );

    // Simulate an old backend writing after migration 049 but before the compatible
    // backend is active. Its finalization-timed row must force uncertainty, not a
    // fabricated daily split or a first-closeout notification flood.
    const legacyGapRunId = (await client.query(
      `INSERT INTO integration_sync_runs
        (user_id, provider, sync_kind, trigger_type, status, finished_at)
       VALUES ($1, 'steam', 'library', 'scheduled', 'succeeded', '2026-09-26T04:00:00Z') RETURNING id`,
      [userId],
    )).rows[0].id;
    await client.query(
      `INSERT INTO steam_sync_jobs
        (id, user_id, account_id, provider_user_id, trigger_type, sync_kind,
         sync_run_id, status, payload_json, completed_at)
       VALUES ($1, $2, $3, '76561190000000002', 'scheduled', 'library', $4,
         'completed', '{}'::jsonb, '2026-09-26T04:00:00Z')`,
      [crypto.randomUUID(), userId, secondAccountId, legacyGapRunId],
    );
    await client.query(
      `INSERT INTO steam_activity_observations
        (user_id, sync_run_id, source_id, game_id, steam_app_id, game_name,
         playtime_minutes_forever, playtime_delta_minutes, interval_started_at,
         observed_at, is_baseline)
       VALUES ($1, $2, $3, $4, '1145360', 'Hades', 160, 30,
         $5, '2026-09-26T04:00:00Z', FALSE)`,
      [userId, legacyGapRunId, sourceId, gameId, runtimeSnapshot],
    );
    const postGapSnapshot = "2026-09-27T02:00:00.000Z";
    const postGapRunId = (await client.query(
      `INSERT INTO integration_sync_runs
        (user_id, provider, sync_kind, trigger_type, status)
       VALUES ($1, 'steam', 'library', 'scheduled', 'running') RETURNING id`,
      [userId],
    )).rows[0].id;
    await client.query(
      `INSERT INTO steam_sync_jobs
        (id, user_id, account_id, provider_user_id, trigger_type, sync_kind,
         sync_run_id, status, payload_json)
       VALUES ($1, $2, $3, '76561190000000002', 'scheduled', 'library', $4,
         'running', jsonb_build_object('snapshotObservedAt', $5::text))`,
      [crypto.randomUUID(), userId, secondAccountId, postGapRunId, postGapSnapshot],
    );
    await client.query(
      "UPDATE user_game_sources SET playtime_minutes_forever = 190 WHERE id = $1",
      [sourceId],
    );
    const postGap = await activity.recordSteamActivityObservations(
      { userId, syncRunId: postGapRunId, snapshotObservedAt: postGapSnapshot }, client,
    );
    assert.ok(postGap.uncertain >= 1);
    const uncertainRow = (await client.query(
      `SELECT id, activity_precision FROM steam_activity_observations
       WHERE sync_run_id = $1 AND steam_app_id = '1145360'`, [postGapRunId],
    )).rows[0];
    assert.equal(uncertainRow.activity_precision, "uncertain");
    assert.equal((await client.query(
      `SELECT COUNT(*)::int AS count FROM user_activity_events
       WHERE sync_run_id = $1 AND event_type = 'steam_played'`, [postGapRunId],
    )).rows[0].count, 1);
    assert.equal((await client.query(
      `SELECT COUNT(*)::int AS count FROM user_activity_events
       WHERE sync_run_id = $1 AND event_type IN ('steam_added_to_library', 'steam_first_played')`,
      [postGapRunId],
    )).rows[0].count, 0);

    const allocation = await activity.saveSteamActivityAllocation(
      userId,
      uncertainRow.id,
      [
        { activityDay: "2026-09-26", minutes: 10 },
        { activityDay: "2026-09-27", minutes: 20 },
      ],
      0,
    );
    assert.equal(allocation.revision, 1);
    assert.equal(allocation.totalMinutes, 30);
    assert.deepEqual(allocation.allocations, [
      { activityDay: "2026-09-26", minutes: 10 },
      { activityDay: "2026-09-27", minutes: 20 },
    ]);
    await assert.rejects(
      activity.saveSteamActivityAllocation(
        userId,
        uncertainRow.id,
        [{ activityDay: "2026-09-26", minutes: 30 }],
        0,
      ),
      /changed/i,
    );
    await assert.rejects(
      activity.saveSteamActivityAllocation(
        userId,
        uncertainRow.id,
        [{ activityDay: "2026-09-26", minutes: 29 }],
        1,
      ),
      /must equal/i,
    );
    await assert.rejects(
      activity.saveSteamActivityAllocation(
        otherUserId,
        uncertainRow.id,
        [{ activityDay: "2026-09-26", minutes: 30 }],
        0,
      ),
      /not found/i,
    );
    await assert.rejects(
      client.query(
        `INSERT INTO steam_activity_allocation_revisions
          (user_id, observation_id, revision, action)
         VALUES ($1, $2, 99, 'reset')`,
        [otherUserId, uncertainRow.id],
      ),
      /owner mismatch/i,
    );
    const reset = await activity.resetSteamActivityAllocation(userId, uncertainRow.id, 1);
    assert.equal(reset.revision, 2);
    assert.deepEqual(reset.allocations, []);
    assert.deepEqual(
      (await client.query(
        `SELECT revision, action FROM steam_activity_allocation_revisions
         WHERE observation_id = $1 ORDER BY revision`,
        [uncertainRow.id],
      )).rows,
      [{ revision: 1, action: "allocate" }, { revision: 2, action: "reset" }],
    );
  } finally {
    await appPool?.end();
    await client.end();
    await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
});
