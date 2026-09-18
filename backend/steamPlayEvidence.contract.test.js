import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

test("Steam play evidence survives delayed decisions and connection replacement", { timeout: 120_000 }, async (t) => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Only disposable localhost fixtures are allowed");
  const database = `steam_play_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  const nativeFetch = globalThis.fetch;
  const unexpectedRequests = [];
  let pool;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    url.pathname = `/${database}`;
    Object.assign(process.env, {
      DATABASE_URL: url.href, PGSSL: "false", NODE_ENV: "test", STEAM_WEB_API_KEY: "fixture",
      STEAM_MOCK_PLAYER_SUMMARY_JSON: JSON.stringify({ response: { players: [] } }),
    });
    ({ pool } = await import("./db.js"));
    // Fresh fixture schema only. No migration runner or existing saved data.
    await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    await pool.query("INSERT INTO statuses (status, rank) VALUES ('plan to play', 1), ('playing', 2), ('finished', 3), ('wishlist', 4)");
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.includes("GetPlayerAchievements")) return Response.json({ playerstats: { success: true, achievements: [] } });
      if (path.includes("GetSchemaForGame")) return Response.json({ game: { availableGameStats: { achievements: [] } } });
      unexpectedRequests.push(path);
      assert.fail(`Unexpected provider request: ${path}`);
    };
    const steam = await import("./services/steamService.js");
    const sync = await import("./services/steamLibrarySyncService.js");
    const wishlist = await import("./services/steamWishlistService.js");
    const activity = await import("./services/steamActivityService.js");
    let sequence = 0;
    const fixture = async ({ backlog = false, startedAt = null } = {}) => {
      const n = ++sequence;
      const userId = (await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, 'fixture') RETURNING id", [`play-${n}`])).rows[0].id;
      const account = await steam.upsertSteamAccount(userId, `76561190000000${String(n).padStart(3, "0")}`);
      const name = `Play evidence game ${n}`;
      const appId = String(70000 + n);
      const catalogId = (await pool.query("INSERT INTO catalog_games (name) VALUES ($1) RETURNING id", [name])).rows[0].id;
      await pool.query("INSERT INTO external_game_ids (catalog_game_id, source, external_id) VALUES ($1, 'steam', $2)", [catalogId, appId]);
      const gameId = backlog ? (await pool.query("INSERT INTO games (user_id, catalog_game_id, name, status, started_at) VALUES ($1,$2,$3,'plan to play',$4) RETURNING id", [userId, catalogId, name, startedAt])).rows[0].id : null;
      const run = async (minutes, lastPlayedAt = null) => {
        process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({ response: { games: [{
          appid: Number(appId), name, playtime_forever: minutes,
          ...(lastPlayedAt ? { rtime_last_played: new Date(lastPlayedAt).getTime() / 1000 } : {}),
        }] } });
        const queued = await sync.enqueueSteamSync(userId, { force: true });
        const job = await sync.waitForSteamSyncJob(userId, queued.id, { pollMs: 5 });
        assert.equal(job.status, "completed", job.errorMessage);
        return job;
      };
      const source = async () => (await pool.query("SELECT * FROM user_game_sources WHERE user_id=$1 AND provider_app_id=$2", [userId, appId])).rows[0];
      const candidate = async () => (await pool.query("SELECT id FROM steam_import_candidates WHERE user_id=$1 AND steam_app_id=$2", [userId, appId])).rows[0].id;
      return { userId, account, name, appId, catalogId, gameId, run, source, candidate };
    };

    await t.test("new import preserves September 11 evidence after later play and duplicate approval", async () => {
      const f = await fixture();
      await f.run(0);
      await f.run(30, "2026-09-11T12:00:00Z");
      await f.run(120, "2026-09-14T12:00:00Z");
      assert.equal((await f.source()).first_play_observed_at.toISOString(), "2026-09-11T12:00:00.000Z");
      const id = await f.candidate();
      await steam.updateSteamImportCandidate(f.userId, id, "set_status", { status: "playing" });
      const imported = await steam.importSteamCandidates(f.userId, [id]);
      const gameId = imported.imported[0].gameId;
      assert.equal((await pool.query("SELECT started_at FROM games WHERE id=$1", [gameId])).rows[0].started_at, "2026-09-11");
      await pool.query("UPDATE steam_import_candidates SET import_status='accepted' WHERE id=$1", [id]);
      const replay = await steam.importSteamCandidates(f.userId, [id]);
      assert.deepEqual(replay.attached, [id]);
      assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM games WHERE user_id=$1", [f.userId])).rows[0].n, 1);
    });

    await t.test("existing Backlog approval uses event evidence, rejects replay and preserves personal dates", async () => {
      for (const personalDate of [null, "2020-02-03"]) {
        const f = await fixture({ backlog: true, startedAt: personalDate });
        await f.run(0);
        await f.run(30, "2026-09-11T22:00:00Z");
        const event = (await pool.query("SELECT * FROM user_activity_events WHERE user_id=$1 AND event_type='steam_status_suggestion'", [f.userId])).rows[0];
        await f.run(90, "2026-09-14T12:00:00Z");
        const result = await steam.applySteamStatusSuggestion(f.userId, f.gameId, {
          activityEventId: event.id, setStartedAt: true, startedAt: "2099-01-01",
        });
        assert.equal(result.game.startedAt, personalDate || "2026-09-12");
        await assert.rejects(steam.applySteamStatusSuggestion(f.userId, f.gameId, { activityEventId: event.id }), error => error.status === 409);
      }
    });

    await t.test("historic play alone leaves started date unknown on import and resume", async () => {
      for (const backlog of [false, true]) {
        const f = await fixture({ backlog });
        await f.run(200, "2026-09-10T12:00:00Z");
        await f.run(240, "2026-09-14T12:00:00Z");
        assert.equal((await f.source()).first_play_observed_at, null);
        if (backlog) {
          const event = (await pool.query("SELECT id FROM user_activity_events WHERE user_id=$1 AND event_type='steam_status_suggestion'", [f.userId])).rows[0];
          const result = await steam.applySteamStatusSuggestion(f.userId, f.gameId, { activityEventId: event.id, setStartedAt: true, startedAt: "2099-01-01" });
          assert.equal(result.game.startedAt, null);
        } else {
          const id = await f.candidate();
          await steam.updateSteamImportCandidate(f.userId, id, "set_status", { status: "playing" });
          const result = await steam.importSteamCandidates(f.userId, [id]);
          assert.equal((await pool.query("SELECT started_at FROM games WHERE id=$1", [result.imported[0].gameId])).rows[0].started_at, null);
        }
      }
    });

    await t.test("missing timestamps freeze the snapshot observation instead of approval time", async () => {
      const f = await fixture();
      await f.run(0);
      const before = Date.now();
      await f.run(30);
      const frozen = (await f.source()).first_play_observed_at;
      assert.ok(frozen.getTime() >= before && frozen.getTime() <= Date.now());
      await f.run(90, "2026-09-14T12:00:00Z");
      assert.equal((await f.source()).first_play_observed_at.toISOString(), frozen.toISOString());
    });

    await t.test("one acquisition action imports once, preserves its selected status on retry, and fences a replaced account", async () => {
      const f = await fixture();
      await f.run(0);
      const newAppId = String(Number(f.appId) + 10_000);
      const newName = `${f.name} newly owned`;
      const newCatalogId = (
        await pool.query("INSERT INTO catalog_games (name) VALUES ($1) RETURNING id", [newName])
      ).rows[0].id;
      const wishlistItemId = (
        await pool.query(
          "INSERT INTO user_wishlist_items (user_id, catalog_game_id, display_name) VALUES ($1, $2, $3) RETURNING id",
          [f.userId, newCatalogId, newName],
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO steam_wishlist_items (user_id, account_id, wishlist_item_id, steam_app_id) VALUES ($1, $2, $3, $4)",
        [f.userId, f.account.id, wishlistItemId, newAppId],
      );
      process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({
        response: {
          games: [
            { appid: Number(f.appId), name: f.name, playtime_forever: 0 },
            { appid: Number(newAppId), name: newName, playtime_forever: 0 },
          ],
        },
      });
      const queued = await sync.enqueueSteamSync(f.userId, { force: true });
      const job = await sync.waitForSteamSyncJob(f.userId, queued.id, { pollMs: 5 });
      assert.equal(job.result.notificationDecisions.created, 1);
      const event = (
        await pool.query(
          "SELECT id, state FROM user_activity_events WHERE user_id=$1 AND external_id=$2 AND event_type='steam_new_game'",
          [f.userId, newAppId],
        )
      ).rows[0];
      assert.equal(event.state, "open");
      const candidate = (
        await pool.query(
          "SELECT id, proposed_catalog_game_id FROM steam_import_candidates WHERE user_id=$1 AND steam_app_id=$2",
          [f.userId, newAppId],
        )
      ).rows[0];
      assert.equal(candidate.proposed_catalog_game_id, newCatalogId);
      const candidateId = candidate.id;
      const first = await steam.addSteamCandidateToBacklog(f.userId, candidateId, {
        status: "playing",
        activityEventId: event.id,
      });
      assert.deepEqual(first.imported, [{ candidateId, gameId: first.gameId }]);
      assert.equal(first.metadataRepairQueued, true);
      const repair = (
        await pool.query(
          "SELECT parameters_json FROM metadata_jobs WHERE job_type='backlog_repair' AND scope_user_id=$1 ORDER BY id DESC LIMIT 1",
          [f.userId],
        )
      ).rows[0];
      assert.ok(repair.parameters_json.priorityGameIds.includes(first.gameId));
      assert.equal(
        (await pool.query("SELECT status FROM games WHERE id=$1", [first.gameId])).rows[0].status,
        "playing",
      );

      const replay = await steam.addSteamCandidateToBacklog(f.userId, candidateId, {
        status: "finished",
      });
      assert.equal(replay.alreadyCompleted, true);
      assert.equal(replay.gameId, first.gameId);
      assert.equal(
        (await pool.query("SELECT status FROM games WHERE id=$1", [first.gameId])).rows[0].status,
        "playing",
      );
      assert.equal(
        (await pool.query("SELECT COUNT(*)::int AS n FROM games WHERE user_id=$1", [f.userId])).rows[0].n,
        1,
      );
      assert.equal(
        (await pool.query("SELECT state FROM user_activity_events WHERE id=$1", [event.id])).rows[0].state,
        "resolved",
      );

      const replaced = await fixture();
      await replaced.run(0);
      const replacedCandidateId = await replaced.candidate();
      await steam.disconnectSteamAccount(replaced.userId);
      await steam.upsertSteamAccount(replaced.userId, "76561199999999888");
      await assert.rejects(
        steam.addSteamCandidateToBacklog(replaced.userId, replacedCandidateId, {
          status: "plan to play",
        }),
        (error) => error?.status === 409,
      );
    });

    await t.test("Wishlist moves preserve first observed dates and membership, including legacy games", async () => {
      for (const legacy of [false, true]) {
        const f = await fixture({ backlog: legacy });
        await f.run(0);
        await f.run(30, "2026-09-11T12:00:00Z");
        if (legacy) await pool.query("UPDATE games SET status='wishlist' WHERE id=$1", [f.gameId]);
        const itemId = (await pool.query("INSERT INTO user_wishlist_items (user_id,game_id,catalog_game_id,display_name,local_intent_active) VALUES ($1,$2,$3,$4,TRUE) RETURNING id", [f.userId, f.gameId, f.catalogId, f.name])).rows[0].id;
        await pool.query("INSERT INTO steam_wishlist_items (user_id,account_id,wishlist_item_id,steam_app_id) VALUES ($1,$2,$3,$4)", [f.userId, f.account.id, itemId, f.appId]);
        const moved = await wishlist.moveWishlistItemToBacklog(f.userId, itemId, "playing");
        const game = (await pool.query("SELECT started_at,status FROM games WHERE id=$1", [moved.gameId])).rows[0];
        assert.deepEqual(game, { started_at: "2026-09-11", status: "playing" });
        assert.equal((await pool.query("SELECT local_intent_active FROM user_wishlist_items WHERE id=$1", [itemId])).rows[0].local_intent_active, true);
        assert.equal((await pool.query("SELECT is_active FROM steam_wishlist_items WHERE wishlist_item_id=$1", [itemId])).rows[0].is_active, true);
        await pool.query("UPDATE games SET started_at='2020-02-03' WHERE id=$1", [moved.gameId]);
        await wishlist.moveWishlistItemToBacklog(f.userId, itemId, "playing");
        assert.equal((await pool.query("SELECT started_at FROM games WHERE id=$1", [moved.gameId])).rows[0].started_at, "2020-02-03");
      }
    });

    await t.test("replacement and reconnection establish fresh baselines without losing history", async () => {
      const f = await fixture();
      await f.run(100);
      await f.run(140);
      const firstAccount = f.account.id;
      await steam.upsertSteamAccount(f.userId, "76561199999999000");
      const replaced = await f.run(500);
      let observation = (await pool.query("SELECT * FROM steam_activity_observations WHERE sync_run_id=$1", [replaced.syncRunId])).rows[0];
      assert.equal(observation.is_baseline, true);
      assert.equal(observation.playtime_delta_minutes, 0);
      const next = await f.run(530);
      observation = (await pool.query("SELECT * FROM steam_activity_observations WHERE sync_run_id=$1", [next.syncRunId])).rows[0];
      assert.equal(observation.playtime_delta_minutes, 30);
      assert.equal(observation.is_baseline, false);
      assert.equal((await activity.recordSteamActivityObservations({ userId: f.userId, syncRunId: next.syncRunId })).recorded, 0);
      await steam.disconnectSteamAccount(f.userId);
      const reconnected = await steam.upsertSteamAccount(f.userId, "76561199999999000");
      assert.notEqual(reconnected.id, firstAccount);
      const resumed = await f.run(900);
      observation = (await pool.query("SELECT * FROM steam_activity_observations WHERE sync_run_id=$1", [resumed.syncRunId])).rows[0];
      assert.equal(observation.is_baseline, true);
      assert.equal(observation.playtime_delta_minutes, 0);
      assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM steam_activity_observations WHERE user_id=$1", [f.userId])).rows[0].n, 5);
    });
    assert.deepEqual(unexpectedRequests, []);
  } finally {
    globalThis.fetch = nativeFetch;
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.end();
  }
});
