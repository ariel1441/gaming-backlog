import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

test("Steam candidates cannot restore facts from a previous connection", { timeout: 60_000 }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const database = `steam_candidate_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  url.pathname = `/${database}`;
  let pool;
  try {
    await promisify(execFile)(process.execPath, ["scripts/db-migrate.js"], {
      env: { ...process.env, DATABASE_URL: url.href, PGSSL: "false" },
    });
    Object.assign(process.env, {
      DATABASE_URL: url.href, PGSSL: "false", NODE_ENV: "test",
      STEAM_MOCK_PLAYER_SUMMARY_JSON: JSON.stringify({ response: { players: [] } }),
    });
    ({ pool } = await import("./db.js"));
    const steam = await import("./services/steamService.js");
    const sync = await import("./services/steamLibrarySyncService.js");
    const catalogIds = new Map();
    for (const [appid, name] of [[41001, "Former account game"], [41002, "Shared account game"], [41003, "Ignored account game"], [41004, "New account game"]]) {
      const catalog = await pool.query("INSERT INTO catalog_games (name) VALUES ($1) RETURNING id", [name]);
      catalogIds.set(appid, catalog.rows[0].id);
      await pool.query("INSERT INTO external_game_ids (source, external_id, catalog_game_id) VALUES ('steam', $1, $2)", [String(appid), catalog.rows[0].id]);
    }
    const userId = (await pool.query("INSERT INTO users (username, password_hash) VALUES ('owner', 'x') RETURNING id")).rows[0].id;
    const runLibrary = async (games) => {
      process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({ response: { games } });
      const queued = await sync.enqueueSteamSync(userId, { force: true });
      const job = await sync.waitForSteamSyncJob(userId, queued.id, { pollMs: 5 });
      assert.equal(job.status, "completed");
    };
    await steam.upsertSteamAccount(userId, "76561190000000010");
    await runLibrary([
      { appid: 41001, name: "Former account game", playtime_forever: 1200 },
      { appid: 41002, name: "Shared account game", playtime_forever: 600 },
      { appid: 41003, name: "Ignored account game", playtime_forever: 900 },
    ]);
    const prior = (await steam.listSteamLinkCandidates(userId)).results;
    const staleId = prior.find(row => row.steamAppId === "41001").id;
    const sharedId = prior.find(row => row.steamAppId === "41002").id;
    const ignoredId = prior.find(row => row.steamAppId === "41003").id;
    await steam.updateSteamImportCandidate(userId, ignoredId, "select_catalog", { catalog_game_id: catalogIds.get(41003) });
    await steam.updateSteamImportCandidate(userId, ignoredId, "set_status", { status: "plan to play" });
    await steam.updateSteamImportCandidate(userId, ignoredId, "ignore");
    const savedDecision = (await pool.query("SELECT * FROM steam_import_candidates WHERE id = $1", [ignoredId])).rows[0];
    await steam.upsertSteamAccount(userId, "76561190000000011");
    assert.deepEqual((await steam.listSteamLinkCandidates(userId)).results, []);
    await runLibrary([
      { appid: 41002, name: "Shared account game", playtime_forever: 5 },
      { appid: 41004, name: "New account game", playtime_forever: 0 },
    ]);
    const gameId = (await pool.query("INSERT INTO games (user_id, name, status) VALUES ($1, 'Personal backlog game', 'plan to play') RETURNING id", [userId])).rows[0].id;

    await assert.rejects(steam.attachSteamCandidateToGame(userId, staleId, gameId), error => error.status === 409);
    await assert.rejects(steam.importSteamCandidates(userId, [staleId]), error => error.status === 409);
    for (const action of ["ignore", "restore", "accept"]) {
      await assert.rejects(steam.updateSteamImportCandidate(userId, staleId, action), error => error.status === 409);
      await assert.rejects(steam.bulkUpdateSteamCandidates(userId, { candidateIds: [staleId, sharedId], action }), error => error.status === 409);
    }
    const links = (await steam.listSteamLinkCandidates(userId)).results;
    assert.deepEqual(links.map(row => row.steamAppId).sort(), ["41002", "41004"]);
    assert.equal(links.find(row => row.id === sharedId).playtimeMinutes, 5);
    const review = await steam.listSteamImportCandidates(userId, { status: "all" });
    assert.deepEqual(review.candidates.map(row => row.steamAppId).sort(), ["41002", "41004"]);
    assert.equal(review.page.total, 2);
    assert.equal(review.summary.total, 2);
    assert.equal(review.summary.ignored, 0);
    assert.equal((await steam.listSteamImportCandidates(userId, { status: "ignored" })).page.total, 0);
    const retained = (await pool.query("SELECT * FROM steam_import_candidates WHERE id = $1", [ignoredId])).rows[0];
    for (const field of ["import_status", "user_selected_catalog_game_id", "selected_status", "decision_at"]) {
      assert.deepEqual(retained[field], savedDecision[field]);
    }
    const oldSource = (await pool.query("SELECT * FROM user_game_sources WHERE user_id = $1 AND provider_app_id = '41001'", [userId])).rows[0];
    assert.equal(oldSource.source_status, "disconnected");
    assert.equal(oldSource.playtime_minutes_forever, null);
    assert.equal(oldSource.game_id, null);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM games WHERE user_id = $1", [userId])).rows[0].n, 1);

    // Even a stale candidate cache for a currently owned app must not overwrite
    // this account's newer (possibly lower) factual counters during attachment.
    await pool.query("UPDATE steam_import_candidates SET playtime_minutes_forever = 600 WHERE id = $1", [sharedId]);
    await steam.attachSteamCandidateToGame(userId, sharedId, gameId);
    const currentSource = (await pool.query("SELECT * FROM user_game_sources WHERE user_id = $1 AND provider_app_id = '41002'", [userId])).rows[0];
    assert.equal(currentSource.playtime_minutes_forever, 5);
    assert.equal(currentSource.game_id, gameId);
    assert.equal(currentSource.source_status, "owned");
    const otherUserId = (await pool.query("INSERT INTO users (username, password_hash) VALUES ('other-owner', 'x') RETURNING id")).rows[0].id;
    await steam.upsertSteamAccount(otherUserId, "76561190000000012");
    assert.deepEqual((await steam.listSteamLinkCandidates(otherUserId)).results, []);
    await assert.rejects(steam.attachSteamCandidateToGame(otherUserId, sharedId, gameId), error => error.status === 409);

    // Scoped bulk work should select only current candidates and remain usable.
    const imported = await steam.importSteamCandidatesForScope(userId, { group: "unplayed", status: "active" });
    assert.equal(imported.imported.length, 1);
    const freshId = links.find(row => row.steamAppId === "41004").id;
    assert.equal(imported.imported[0].candidateId, freshId);
    await steam.updateSteamImportCandidate(userId, sharedId, "ignore");
    await steam.updateSteamImportCandidate(userId, sharedId, "restore");
    await steam.updateSteamImportCandidate(userId, sharedId, "accept");
    const duplicateImport = await steam.importSteamCandidates(userId, [sharedId]);
    assert.deepEqual(duplicateImport.attached, [sharedId]);
    assert.deepEqual(duplicateImport.imported, []);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM games WHERE user_id = $1", [userId])).rows[0].n, 2);

    await steam.disconnectSteamAccount(userId);
    assert.deepEqual((await steam.listSteamLinkCandidates(userId)).results, []);
    assert.equal((await steam.listSteamImportCandidates(userId, { status: "all" })).summary.total, 0);
    await assert.rejects(steam.attachSteamCandidateToGame(userId, sharedId, gameId), error => error.status === 409);
    await assert.rejects(steam.importSteamCandidates(userId, [freshId]), error => error.status === 409);
    await assert.rejects(steam.bulkUpdateSteamCandidates(userId, { candidateIds: [ignoredId], action: "restore" }), error => error.status === 409);

    // Re-observation restores availability, including the retained ignore/match
    // decisions, without deleting ordinary games or manufacturing new ones.
    await steam.upsertSteamAccount(userId, "76561190000000010");
    await runLibrary([{ appid: 41003, name: "Ignored account game", playtime_forever: 20 }]);
    const ignoredReview = await steam.listSteamImportCandidates(userId, { status: "ignored" });
    assert.equal(ignoredReview.page.total, 1);
    assert.equal(ignoredReview.candidates[0].id, ignoredId);
    assert.equal(ignoredReview.candidates[0].playtimeMinutes, 20);
    assert.equal(ignoredReview.candidates[0].proposedCatalogGameId, catalogIds.get(41003));
    assert.equal(ignoredReview.candidates[0].selectedStatus, "plan to play");
    await steam.bulkUpdateSteamCandidates(userId, { candidateIds: [ignoredId], action: "restore" });

    // Pause a stale client's action before its account lock, replace the account,
    // then resume it. Validation must happen after the replacement commits.
    const originalConnect = pool.connect;
    let resume, reached;
    const paused = new Promise(resolve => { reached = resolve; });
    const gate = new Promise(resolve => { resume = resolve; });
    pool.connect = async (...args) => {
      pool.connect = originalConnect;
      const client = await originalConnect.apply(pool, args);
      return {
        query: async (sql, values) => {
          if (String(sql).includes("SELECT id FROM user_external_accounts")) {
            reached();
            await gate;
          }
          return client.query(sql, values);
        },
        release: () => client.release(),
      };
    };
    const lateAttach = steam.attachSteamCandidateToGame(userId, ignoredId, gameId);
    const rejected = assert.rejects(lateAttach, error => error.status === 409);
    try {
      await paused;
      await steam.upsertSteamAccount(userId, "76561190000000013");
    } finally {
      pool.connect = originalConnect;
      resume();
    }
    await rejected;
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM games WHERE user_id = $1", [userId])).rows[0].n, 2);
  } finally {
    await pool?.end();
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [database]);
    await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
});
