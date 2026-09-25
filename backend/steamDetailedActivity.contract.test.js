import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

dotenv.config();

test("detailed Steam activity baselines named unlocks and groups reliable facts", { timeout: 120_000 }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const database = `steam_detailed_activity_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  url.pathname = `/${database}`;
  const nativeFetch = globalThis.fetch;
  let pool;
  try {
    const migrate = () => promisify(execFile)(process.execPath, ["scripts/db-migrate.js"], {
      env: { ...process.env, DATABASE_URL: url.href, PGSSL: "false" },
    });
    await migrate();
    await migrate();
    Object.assign(process.env, {
      DATABASE_URL: url.href,
      PGSSL: "false",
      NODE_ENV: "test",
      STEAM_WEB_API_KEY: "test-key",
    });
    ({ pool } = await import("./db.js"));
    const steam = await import("./services/steamService.js");
    const activity = await import("./services/steamActivityService.js");
    const inbox = await import("./services/activityInboxService.js");
    const events = await import("./services/activityEventService.js");

    const userId = (await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ('activity-owner', 'x') RETURNING id",
    )).rows[0].id;
    const gameId = (await pool.query(
      "INSERT INTO games (user_id, name, status) VALUES ($1, 'Night game', 'plan to play') RETURNING id",
      [userId],
    )).rows[0].id;
    let account = await steam.upsertSteamAccount(userId, "76561190000000000");
    await pool.query(
      "UPDATE user_external_accounts SET linked_at = '2026-09-01T00:00:00Z' WHERE id = $1",
      [account.id],
    );
    const sourceId = (await pool.query(
      `INSERT INTO user_game_sources
        (user_id, game_id, provider, provider_app_id, playtime_minutes_forever)
       VALUES ($1, $2, 'steam', '10', 40) RETURNING id`,
      [userId, gameId],
    )).rows[0].id;

    let providerAchievements = [
      { apiname: "OLD", name: "Old unlock", achieved: 1, unlocktime: 1_789_646_400 },
      { apiname: "AFTER_ONE", name: "After baseline one", achieved: 1, unlocktime: 1_789_700_400 },
      { apiname: "AFTER_TWO", name: "After baseline two", achieved: 1, unlocktime: 1_789_704_000 },
      { apiname: "NIGHT", name: "Night unlock", achieved: 0, unlocktime: 0 },
      { apiname: "IGNORED", name: "Ignored-game unlock", achieved: 0, unlocktime: 0 },
    ];
    let privateAchievements = false;
    globalThis.fetch = async (input) => {
      const request = new URL(String(input));
      if (request.pathname.includes("GetPlayerAchievements")) {
        const payload = privateAchievements
          ? { playerstats: { success: false, error: "Profile is private" } }
          : { playerstats: { success: true, achievements: providerAchievements } };
        return Response.json(payload);
      }
      if (request.pathname.includes("GetSchemaForGame")) {
        return Response.json({
          game: {
            availableGameStats: {
              achievements: [
                { name: "OLD", displayName: "Old unlock" },
                { name: "AFTER_ONE", displayName: "After baseline one" },
                { name: "AFTER_TWO", displayName: "After baseline two" },
                { name: "NIGHT", displayName: "Night unlock", description: "After midnight" },
                { name: "IGNORED", displayName: "Ignored-game unlock" },
              ],
            },
          },
        });
      }
      throw new Error(`Unexpected provider request: ${request.pathname}`);
    };

    const makeRun = async (snapshotObservedAt, playtime) => {
      await pool.query(
        `UPDATE steam_sync_jobs SET status = 'completed', completed_at = NOW()
         WHERE user_id = $1 AND status = 'running'`,
        [userId],
      );
      await pool.query(
        `UPDATE integration_sync_runs SET status = 'succeeded', finished_at = NOW()
         WHERE user_id = $1 AND status = 'running'`,
        [userId],
      );
      const runId = (await pool.query(
        `INSERT INTO integration_sync_runs
          (user_id, provider, sync_kind, trigger_type, status)
         VALUES ($1, 'steam', 'library', 'scheduled', 'running') RETURNING id`,
        [userId],
      )).rows[0].id;
      await pool.query(
        `INSERT INTO steam_sync_jobs
          (id, user_id, account_id, provider_user_id, trigger_type, sync_kind,
           sync_run_id, status, payload_json)
         VALUES ($1, $2, $3, $4, 'scheduled', 'library', $5, 'running',
           jsonb_build_object('snapshotObservedAt', $6::text))`,
        [crypto.randomUUID(), userId, account.id, account.provider_user_id, runId, snapshotObservedAt],
      );
      await pool.query(
        "UPDATE user_game_sources SET playtime_minutes_forever = $2, last_synced_at = $3 WHERE id = $1",
        [sourceId, playtime, snapshotObservedAt],
      );
      return runId;
    };

    const baselineAt = "2026-09-18T02:00:00.000Z";
    const baselineRunId = await makeRun(baselineAt, 40);
    assert.equal((await activity.recordSteamActivityObservations({
      userId, syncRunId: baselineRunId, snapshotObservedAt: baselineAt,
    })).baselines, 1);
    const baselineAchievements = await steam.syncSteamAchievementsForSourceIds(
      userId, [sourceId], { force: true, syncRunId: baselineRunId, observedAt: baselineAt },
    );
    assert.equal(baselineAchievements.baselineUnlocks, 1, JSON.stringify(baselineAchievements));
    assert.equal(baselineAchievements.newUnlocks, 2);
    assert.equal((await pool.query(
      "SELECT COUNT(*)::int AS count FROM user_activity_events WHERE event_type = 'steam_achievement_unlocked'",
    )).rows[0].count, 2);
    assert.deepEqual((await pool.query(
      `SELECT payload_json->>'achievementName' AS name
       FROM user_activity_events WHERE event_type = 'steam_achievement_unlocked'
       ORDER BY observed_at, id`,
    )).rows.map((row) => row.name), ["After baseline one", "After baseline two"]);
    const replayedBaseline = await steam.syncSteamAchievementsForSourceIds(
      userId, [sourceId], { force: true, syncRunId: baselineRunId, observedAt: baselineAt },
    );
    assert.equal(replayedBaseline.newUnlocks, 0);

    const playedAt = "2026-09-19T02:00:00.000Z";
    const playedRunId = await makeRun(playedAt, 100);
    await pool.query(
      `UPDATE user_game_sources
       SET first_play_observed_at = $2, first_play_observed_playtime_minutes = 100,
           ownership_observed_run_id = $3
       WHERE id = $1`,
      [sourceId, playedAt, playedRunId],
    );
    await events.createOpenActivityEvent({
      userId,
      source: "steam_library",
      eventType: "steam_status_suggestion",
      gameId,
      externalId: "10",
      syncRunId: playedRunId,
      dedupeKey: "status-suggestion:10:plan to play",
      payload: { steamName: "Night game" },
      observedAt: playedAt,
    });
    providerAchievements = providerAchievements.map((achievement) =>
      achievement.apiname === "NIGHT"
        ? { ...achievement, description: "After midnight", achieved: 1, unlocktime: 1_789_770_600 }
        : achievement);
    const achievementResult = await steam.syncSteamAchievementsForSourceIds(
      userId, [sourceId], { force: true, syncRunId: playedRunId, observedAt: playedAt },
    );
    assert.equal(achievementResult.newUnlocks, 1);
    const personalBeforeActivity = (await pool.query(
      `SELECT status, started_at, backlog_added_at, backlog_added_at_source
       FROM games WHERE id = $1`, [gameId],
    )).rows[0];
    const played = await activity.recordSteamActivityObservations({
      userId, syncRunId: playedRunId, snapshotObservedAt: playedAt,
    });
    assert.equal(played.daily, 1);
    const personalAfterActivity = (await pool.query(
      `SELECT status, started_at, backlog_added_at, backlog_added_at_source
       FROM games WHERE id = $1`, [gameId],
    )).rows[0];
    assert.deepEqual(personalAfterActivity, personalBeforeActivity);
    assert.equal(personalAfterActivity.status, "plan to play");
    assert.equal(personalAfterActivity.started_at, null);
    assert.equal((await activity.recordSteamActivityObservations({
      userId, syncRunId: playedRunId, snapshotObservedAt: playedAt,
    })).recorded, 0);

    const unlockRows = (await pool.query(
      `SELECT achievement_api_name, display_name, unlock_at, activity_day::text, is_baseline
       FROM steam_achievement_unlocks ORDER BY unlock_at, id`,
    )).rows;
    assert.equal(unlockRows.length, 4);
    assert.equal(unlockRows.filter((row) => row.is_baseline).length, 1);
    const nightUnlock = unlockRows.find((row) => row.achievement_api_name === "NIGHT");
    assert.equal(nightUnlock.display_name, "Night unlock");
    assert.equal(nightUnlock.unlock_at.toISOString(), "2026-09-18T22:30:00.000Z");
    assert.equal(nightUnlock.activity_day, "2026-09-18");

    const decision = (await inbox.listActivityInbox(userId, { section: "attention" })).groups[0];
    assert.equal(decision.events[0].payload.firstPlayed, true);
    assert.equal(decision.events[0].payload.addedToLibrary, true);
    const updates = await inbox.listActivityInbox(userId, { section: "updates", limit: 20 });
    const playedGroup = updates.groups.find((group) =>
      group.events.some((event) => event.eventType === "steam_played"));
    assert.ok(playedGroup);
    assert.deepEqual(
      new Set(playedGroup.events.map((event) => event.eventType)),
      new Set([
        "steam_played",
        "steam_achievement_unlocked",
        "steam_first_played",
        "steam_added_to_library",
      ]),
    );

    const uncertainRunId = await makeRun("2026-09-22T02:00:00.000Z", 130);
    assert.equal((await activity.recordSteamActivityObservations({
      userId, syncRunId: uncertainRunId, snapshotObservedAt: "2026-09-22T02:00:00.000Z",
    })).uncertain, 1);
    const afterUncertainRunId = await makeRun("2026-09-23T02:00:00.000Z", 160);
    await activity.recordSteamActivityObservations({
      userId, syncRunId: afterUncertainRunId, snapshotObservedAt: "2026-09-23T02:00:00.000Z",
    });
    assert.equal((await pool.query(
      "SELECT COUNT(*)::int AS count FROM user_activity_events WHERE event_type = 'steam_returned'",
    )).rows[0].count, 0);

    for (const [timestamp, playtime] of [
      ["2026-09-24T02:00:00.000Z", 160],
      ["2026-09-25T02:00:00.000Z", 160],
      ["2026-09-26T02:00:00.000Z", 190],
    ]) {
      const runId = await makeRun(timestamp, playtime);
      await activity.recordSteamActivityObservations({ userId, syncRunId: runId, snapshotObservedAt: timestamp });
    }
    const returned = (await pool.query(
      `SELECT payload_json FROM user_activity_events
       WHERE event_type = 'steam_returned' ORDER BY id DESC LIMIT 1`,
    )).rows[0];
    assert.equal(returned.payload_json.daysSincePrevious, 3);

    await pool.query(
      "UPDATE user_game_sources SET source_status = 'ignored', game_id = NULL WHERE id = $1",
      [sourceId],
    );
    providerAchievements = providerAchievements.map((achievement) =>
      achievement.apiname === "IGNORED"
        ? { ...achievement, achieved: 1, unlocktime: 1_790_378_400 }
        : achievement);
    const ignoredResult = await steam.syncSteamAchievementsForSourceIds(
      userId, [sourceId], { force: true, syncRunId: playedRunId, observedAt: playedAt },
    );
    assert.equal(ignoredResult.newUnlocks, 1, JSON.stringify(ignoredResult));
    assert.equal((await pool.query(
      "SELECT COUNT(*)::int AS count FROM steam_achievement_unlocks WHERE source_id = $1",
      [sourceId],
    )).rows[0].count, 5);

    const beforePrivate = (await pool.query(
      "SELECT achievements_unlocked FROM user_game_sources WHERE id = $1", [sourceId],
    )).rows[0].achievements_unlocked;
    privateAchievements = true;
    const privateResult = await steam.syncSteamAchievementsForSourceIds(
      userId, [sourceId], { force: true, syncRunId: playedRunId, observedAt: playedAt },
    );
    assert.equal(privateResult.private, 1);
    assert.equal((await pool.query(
      "SELECT achievements_unlocked FROM user_game_sources WHERE id = $1", [sourceId],
    )).rows[0].achievements_unlocked, beforePrivate);

    const retrySourceId = (await pool.query(
      `INSERT INTO user_game_sources
        (user_id, provider, provider_app_id, playtime_minutes_forever)
       VALUES ($1, 'steam', '20', 0) RETURNING id`,
      [userId],
    )).rows[0].id;
    const retryBaselineRun = await makeRun("2026-09-27T02:00:00.000Z", 190);
    const retryPrivate = await steam.syncSteamAchievementsForSourceIds(
      userId, [retrySourceId], { force: true, syncRunId: retryBaselineRun, observedAt: "2026-09-27T02:00:00.000Z" },
    );
    assert.equal(retryPrivate.private, 1);
    assert.equal((await pool.query(
      "SELECT achievement_events_initialized_at FROM user_game_sources WHERE id = $1", [retrySourceId],
    )).rows[0].achievement_events_initialized_at, null);
    privateAchievements = false;
    const retrySuccess = await steam.syncSteamAchievementsForSourceIds(
      userId, [retrySourceId], { force: true, syncRunId: retryBaselineRun, observedAt: "2026-09-27T02:00:00.000Z" },
    );
    assert.ok(retrySuccess.baselineUnlocks > 0);
    assert.ok(retrySuccess.newUnlocks > 0);
    assert.ok((await pool.query(
      "SELECT achievement_events_initialized_at FROM user_game_sources WHERE id = $1", [retrySourceId],
    )).rows[0].achievement_events_initialized_at);

    const achievementEventsBeforeReplacement = (await pool.query(
      "SELECT COUNT(*)::int AS count FROM user_activity_events WHERE event_type = 'steam_achievement_unlocked'",
    )).rows[0].count;
    account = await steam.upsertSteamAccount(userId, "76561190000000009");
    await pool.query(
      `UPDATE user_game_sources SET source_status = 'owned', game_id = $2
       WHERE id = $1`,
      [sourceId, gameId],
    );
    const replacementRun = await makeRun("2026-09-28T02:00:00.000Z", 190);
    assert.equal((await activity.recordSteamActivityObservations({
      userId, syncRunId: replacementRun, snapshotObservedAt: "2026-09-28T02:00:00.000Z",
    })).baselines, 1);
    const replacementAchievements = await steam.syncSteamAchievementsForSourceIds(
      userId, [sourceId], { force: true, syncRunId: replacementRun, observedAt: "2026-09-28T02:00:00.000Z" },
    );
    assert.equal(replacementAchievements.newUnlocks, 0);
    assert.ok(replacementAchievements.baselineUnlocks > 0);
    assert.equal((await pool.query(
      "SELECT COUNT(*)::int AS count FROM user_activity_events WHERE event_type = 'steam_achievement_unlocked'",
    )).rows[0].count, achievementEventsBeforeReplacement);

    assert.equal((await pool.query(
      "SELECT COUNT(*)::int AS count FROM schema_migrations WHERE filename = '050_add_detailed_activity_events.sql'",
    )).rows[0].count, 1);

    const otherUserId = (await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ('other-owner', 'x') RETURNING id",
    )).rows[0].id;
    const ownerFeed = await activity.listSteamActivityHistory(userId, { range: "all" });
    assert.ok(ownerFeed.items.some((item) => item.type === "day" && item.date === "2026-09-18"));
    assert.ok(ownerFeed.items.some((item) => item.type === "uncertain"));
    assert.ok(ownerFeed.summary.playtimeMinutes >= 90);
    assert.ok(ownerFeed.summary.achievementsUnlocked >= 1);
    assert.ok(ownerFeed.items.some((item) => item.games.some((game) =>
      game.highlights.some((highlight) => highlight.type === "first_played"))));
    assert.deepEqual((await activity.listSteamActivityHistory(otherUserId, { range: "all" })).items, []);
    const ownerInsights = await activity.listSteamActivityInsights(userId, { range: "all" });
    assert.ok(ownerInsights.summary.playtimeMinutes >= 90);
    assert.ok(ownerInsights.summary.achievementsUnlocked >= 1);
    assert.ok(ownerInsights.mostPlayed.some((game) => game.steamAppId === "10"));
    assert.ok(ownerInsights.firstObservedPlays.some((game) => game.activityDay === "2026-09-18"));
    assert.ok(ownerInsights.dailyBars.some((day) => day.day === "2026-09-18"));
    assert.deepEqual((await activity.listSteamActivityInsights(otherUserId, { range: "all" })).mostPlayed, []);
    await assert.rejects(
      pool.query(
        `INSERT INTO steam_achievement_unlocks
          (user_id, account_id, steam_app_id, achievement_api_name, display_name, is_baseline)
         VALUES ($1, $2, 'bad', 'BAD', 'Bad owner', TRUE)`,
        [otherUserId, account.id],
      ),
      (error) => error?.code === "23514",
    );
  } finally {
    globalThis.fetch = nativeFetch;
    await pool?.end();
    await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
});
