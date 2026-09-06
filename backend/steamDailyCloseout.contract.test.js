import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
dotenv.config();

test("daily Steam follow-up survives unchanged snapshots, cancellation and account changes", { timeout: 120_000 }, async (t) => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const database = `steam_closeout_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  url.pathname = `/${database}`;
  const nativeFetch = globalThis.fetch;
  let pool, releasePlayer;
  try {
    await promisify(execFile)(process.execPath, ["scripts/db-migrate.js"], {
      env: { ...process.env, DATABASE_URL: url.href, PGSSL: "false" },
    });
    Object.assign(process.env, { DATABASE_URL: url.href, PGSSL: "false", NODE_ENV: "test", STEAM_WEB_API_KEY: "test-key" });
    for (const name of ["STEAM_MOCK_OWNED_GAMES_JSON", "STEAM_MOCK_PLAYER_SUMMARY_JSON", "STEAM_MOCK_WISHLIST_JSON"]) delete process.env[name];
    ({ pool } = await import("./db.js"));
    const sync = await import("./services/steamLibrarySyncService.js");
    const steam = await import("./services/steamService.js");
    const wishlist = await import("./services/steamWishlistService.js");
    const { runDailySteamSync } = await import("../scripts/sync-steam-daily.js");
    const userId = (await pool.query("INSERT INTO users (username, password_hash) VALUES ('owner', 'x') RETURNING id")).rows[0].id;
    let account = await steam.upsertSteamAccount(userId, "76561190000000000");
    await steam.updateSteamAutoSync(userId, true);
    const gameIds = (await pool.query(
      "INSERT INTO games (user_id, name, status) VALUES ($1, 'First game', 'playing'), ($1, 'Second game', 'playing') RETURNING id", [userId],
    )).rows.map(row => row.id);
    await pool.query(
      `INSERT INTO user_game_sources (user_id, provider, provider_app_id, game_id, playtime_minutes_forever)
       SELECT $1, 'steam', n::text, CASE n WHEN 1 THEN $2::int WHEN 2 THEN $3::int END, 10 FROM generate_series(1, 1000) n`,
      [userId, ...gameIds],
    );
    const catalogId = (await pool.query("INSERT INTO catalog_games (name) VALUES ('New acquisition') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO external_game_ids (catalog_game_id, source, external_id) VALUES ($1, 'steam', '1001')", [catalogId]);
    const library = Array.from({ length: 1001 }, (_, i) => ({
      appid: i + 1, name: i === 0 ? "First game" : i === 1 ? "Second game" : i === 1000 ? "New acquisition" : `Game ${i + 1}`,
      playtime_forever: i === 0 ? 20 : i === 1 ? 30 : i === 1000 ? 0 : 10,
    }));
    let playerMode = "success", playerStarted, wishlistMode = false;
    const calls = [];
    globalThis.fetch = async (input) => {
      const request = new URL(String(input));
      calls.push({ path: request.pathname, appid: request.searchParams.get("appid") });
      let payload;
      if (request.pathname.includes("GetOwnedGames")) payload = { response: { game_count: library.length, games: library } };
      else if (request.pathname.includes("GetPlayerSummaries")) payload = { response: { players: [] } };
      else if (request.pathname.includes("GetSchemaForGame")) payload = { game: { availableGameStats: { achievements: [{}, {}] } } };
      else if (request.pathname.includes("GetPlayerAchievements")) {
        if (playerMode === "hold") {
          await new Promise(resolve => { releasePlayer = resolve; playerStarted?.(); });
        }
        if (playerMode === "failed") return new Response("unavailable", { status: 503 });
        payload = playerMode === "private"
          ? { playerstats: { success: false, error: "Profile is private" } }
          : { playerstats: { success: true, achievements: [{ achieved: 1 }, { achieved: 0 }] } };
      } else if (wishlistMode && request.pathname.includes("GetWishlistSortedFiltered")) {
        return new Response("unavailable", { status: 503 });
      } else if (wishlistMode && request.pathname.includes("GetWishlistItemCount")) {
        payload = { response: { count: 1 } };
      } else if (wishlistMode && request.pathname.includes("GetWishlist")) {
        payload = { response: { items: [{ appid: 1, priority: 0 }] } };
      } else throw new Error(`Unexpected provider request: ${request.pathname}`);
      return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json", "x-eresult": "1" } });
    };
    const source = async () => (await pool.query("SELECT * FROM user_game_sources WHERE user_id = $1 AND provider_app_id = '1'", [userId])).rows[0];
    const ageLibrary = () => pool.query("UPDATE user_external_accounts SET last_library_sync_at = NOW() - INTERVAL '1 day' WHERE id = $1", [account.id]);
    const due = () => pool.query(
      `UPDATE user_game_sources SET achievements_last_attempt_at = NOW() - INTERVAL '1 day',
        achievements_last_synced_at = NOW() - INTERVAL '1 day', achievements_next_attempt_at = NOW() - INTERVAL '1 second'
       WHERE user_id = $1 AND provider_app_id = '1'`, [userId],
    );
    const finish = async (options = {}) => {
      await ageLibrary();
      const job = await sync.enqueueSteamSync(userId, { trigger: "scheduled", ...options });
      assert.ok(job);
      const result = await sync.waitForSteamSyncJob(userId, job.id, { pollMs: 5 });
      // Drain the finishing worker before tests deliberately hold the next request.
      while ((await sync.getSteamSyncJob(userId, job.id)).status === 'running') await new Promise(resolve => setTimeout(resolve, 5));
      return result;
    };
    const achievementCalls = () => calls.filter(call => /GetPlayerAchievements|GetSchemaForGame/.test(call.path));

    await t.test("1,000 saved apps, two changed linked games and one acquisition need six Steam requests", async () => {
      const result = await finish();
      assert.equal(result.result.run.status, "succeeded");
      assert.equal(result.result.sourcesCreated, 1);
      assert.equal(result.result.sourcesUpdated, 2);
      assert.equal(calls.length, 6);
      assert.deepEqual(achievementCalls().map(call => call.appid).sort(), ["1", "1", "2", "2"]);
      calls.length = 0;
      await finish();
      assert.equal(calls.length, 2);
      assert.equal(achievementCalls().length, 0);
    });

    await t.test("exhausted player retries preserve good counts and retry without new playtime", async () => {
      await due();
      const before = await source();
      library[0].playtime_forever++;
      playerMode = "failed";
      calls.length = 0;
      const failed = await finish();
      assert.equal(failed.result.run.status, "partial");
      assert.equal(calls.filter(call => call.path.includes("GetPlayerAchievements")).length, 3);
      const saved = await source();
      assert.equal(saved.achievements_unlocked, before.achievements_unlocked);
      assert.equal(saved.achievements_last_synced_at.getTime(), before.achievements_last_synced_at.getTime());
      assert.equal(saved.achievements_status, "failed");
      assert.ok(saved.achievements_pending_at);
      assert.ok(saved.achievements_next_attempt_at > new Date());
      calls.length = 0;
      await finish();
      assert.equal(achievementCalls().length, 0);
      await due();
      playerMode = "success";
      const recovered = await finish();
      assert.equal(recovered.result.summary.activityChanged, 0);
      assert.equal(recovered.result.achievements.synced, 1);
      assert.equal((await source()).achievements_pending_at, null);
    });

    await t.test("cooldown-skipped activity remains pending on an unchanged next run", async () => {
      library[0].playtime_forever++;
      calls.length = 0;
      await finish();
      assert.equal(achievementCalls().length, 0);
      assert.ok((await source()).achievements_pending_at);
      await due();
      const recovered = await finish();
      assert.equal(recovered.result.summary.activityChanged, 0);
      assert.equal(achievementCalls().length, 2);
      assert.equal((await source()).achievements_pending_at, null);
    });

    await t.test("cancellation after source persistence fences results but preserves due work", async () => {
      await due();
      await ageLibrary();
      library[0].playtime_forever++;
      playerMode = "hold";
      const started = new Promise(resolve => { playerStarted = resolve; });
      const job = await sync.enqueueSteamSync(userId);
      await started;
      assert.equal((await source()).playtime_minutes_forever, library[0].playtime_forever);
      await sync.cancelSteamSyncJob(userId, job.id);
      playerMode = "success";
      releasePlayer();
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.ok((await source()).achievements_pending_at);
      const recovered = await finish();
      assert.equal(recovered.result.summary.activityChanged, 0);
      assert.equal(recovered.result.achievements.synced, 1);
    });

    await t.test("late manual responses cannot clear newer activity; explicit privacy preserves counts", async () => {
      playerMode = "hold";
      const started = new Promise(resolve => { playerStarted = resolve; });
      const manual = steam.syncSteamAchievementsForGame(userId, gameIds[0], { force: true });
      await started;
      library[0].playtime_forever++;
      await finish();
      playerMode = "success";
      releasePlayer();
      assert.equal((await manual).skipped, true);
      assert.ok((await source()).achievements_pending_at);
      await due();
      playerMode = "private";
      assert.equal((await finish()).result.run.status, "partial");
      assert.equal((await source()).achievements_unlocked, 1);
      assert.equal((await source()).achievements_status, "private");
      playerMode = "success";
    });

    await t.test("replacement fences manual responses and archives memberships without changing local intentions", async () => {
      const itemId = (await pool.query(
        "INSERT INTO user_wishlist_items (user_id, display_name, local_intent_active) VALUES ($1, 'Local intention', TRUE) RETURNING id", [userId],
      )).rows[0].id;
      await pool.query(
        "INSERT INTO steam_wishlist_items (user_id, account_id, wishlist_item_id, steam_app_id, provider_order) VALUES ($1, $2, $3, '1', 17)", [userId, account.id, itemId],
      );
      await pool.query("UPDATE user_external_accounts SET wishlist_empty_observed_at = NOW(), wishlist_empty_observations = 1, wishlist_sync_status = 'empty_unconfirmed' WHERE id = $1", [account.id]);
      playerMode = "hold";
      const started = new Promise(resolve => { playerStarted = resolve; });
      const manual = steam.syncSteamAchievementsForGame(userId, gameIds[0], { force: true });
      await started;
      const oldAccountId = account.id;
      account = await steam.upsertSteamAccount(userId, "76561190000000001");
      playerMode = "success";
      releasePlayer();
      assert.equal((await manual).skipped, true);
      assert.notEqual(account.id, oldAccountId);
      assert.equal(account.auto_sync_enabled, false);
      assert.equal(account.last_library_sync_at, null);
      assert.equal(account.wishlist_empty_observed_at, null);
      assert.equal((await source()).achievements_unlocked, null);
      assert.equal((await source()).achievements_pending_at, null);
      assert.equal((await source()).first_play_observed_at, null);
      const list = await wishlist.listWishlistItems(userId);
      assert.equal(list.total, 1);
      assert.equal(list.items[0].localActive, true);
      assert.equal(list.items[0].steamActive, false);
      assert.equal(list.items[0].removalReason, "account_disconnected");
      await steam.updateSteamAutoSync(userId, true);
      assert.equal(await sync.enqueueSteamSync(userId, { trigger: "scheduled", expectedAccountId: oldAccountId }), null);
      // A new account's partial metadata cannot inherit the former account's order.
      wishlistMode = true;
      await finish({ syncKind: "wishlist" });
      assert.equal((await wishlist.listWishlistItems(userId)).items[0].providerOrder, null);
      wishlistMode = false;
      await steam.disconnectSteamAccount(userId);
      // Older versions disconnected without clearing these caches/memberships.
      await pool.query("UPDATE user_game_sources SET achievements_unlocked = 2, achievements_total = 2, achievements_percent = 100, achievements_status = 'synced' WHERE user_id = $1 AND provider_app_id = '1'", [userId]);
      await pool.query("UPDATE steam_wishlist_items SET is_active = TRUE WHERE user_id = $1", [userId]);
      account = await steam.upsertSteamAccount(userId, "76561190000000002");
      assert.equal((await wishlist.listWishlistItems(userId)).items[0].steamActive, false);
      assert.equal((await source()).achievements_status, "unknown");
      assert.equal((await source()).achievements_unlocked, null);
    });

    await t.test("queued opt-out makes no requests; the daily runner rechecks between domains", async () => {
      await steam.updateSteamAutoSync(userId, true);
      const queuedId = crypto.randomUUID();
      await pool.query(
        "INSERT INTO steam_sync_jobs (id, user_id, account_id, provider_user_id, trigger_type) VALUES ($1, $2, $3, $4, 'scheduled')",
        [queuedId, userId, account.id, account.provider_user_id],
      );
      await steam.updateSteamAutoSync(userId, false);
      calls.length = 0;
      const skipped = await sync.waitForSteamSyncJob(userId, queuedId, { pollMs: 5 });
      assert.equal(skipped.run.status, "skipped");
      assert.equal(calls.length, 0);
      assert.equal(await sync.enqueueSteamSync(userId, { trigger: "scheduled" }), null);
      await steam.updateSteamAutoSync(userId, true);
      // Skip Library by its existing cooldown; Wishlist must see the intervening opt-out.
      await pool.query("UPDATE user_external_accounts SET last_library_sync_at = NOW() WHERE id = $1", [account.id]);
      await pool.query("UPDATE user_game_sources SET source_status = 'owned' WHERE user_id = $1", [userId]);
      const totals = await runDailySteamSync({
        waitForJob: async (id, jobId) => {
          const result = await sync.waitForSteamSyncJob(id, jobId, { pollMs: 5 });
          await steam.updateSteamAutoSync(id, false);
          return result;
        }, logger: { log() {}, error() {} },
      });
      assert.equal(totals.library.skipped, 1);
      assert.equal(totals.wishlist.skipped, 1);
      assert.equal(calls.length, 0);
      assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM games WHERE user_id = $1", [userId])).rows[0].n, 2);
    });
  } finally {
    releasePlayer?.();
    globalThis.fetch = nativeFetch;
    await pool?.end();
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [database]);
    await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
});
