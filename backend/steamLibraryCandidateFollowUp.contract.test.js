import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

test("Steam candidate matching drains durable work without crossing interruption or account epochs", { timeout: 120_000 }, async () => {
  const baseUrl = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname));
  const database = `steam_candidate_followup_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: baseUrl.href, ssl: false });
  let pool;
  const nativeFetch = globalThis.fetch;
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  try {
    const databaseUrl = new URL(baseUrl);
    databaseUrl.pathname = `/${database}`;
    Object.assign(process.env, { DATABASE_URL: databaseUrl.href, PGSSL: "false", NODE_ENV: "test" });
    ({ pool } = await import("./db.js"));
    await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    globalThis.fetch = async input => {
      assert.fail(`Unexpected provider request: ${String(input)}`);
    };

    const { autoMatchSteamCandidates } = await import("./services/steamService.js");
    const userId = (await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ('candidate-followup-owner', 'fixture') RETURNING id",
    )).rows[0].id;
    const account = (await pool.query(
      `INSERT INTO user_external_accounts (user_id, provider, provider_user_id, linked_at)
       VALUES ($1, 'steam', '76561198000000999', '2026-01-01T00:00:00Z') RETURNING id`,
      [userId],
    )).rows[0];

    await pool.query(`
      INSERT INTO catalog_games (id, name)
      SELECT 10000 + n, 'Library Game ' || n FROM generate_series(1, 251) n;
      INSERT INTO external_game_ids (catalog_game_id, source, external_id)
      SELECT 10000 + n, 'steam', (50000 + n)::text FROM generate_series(1, 251) n;
      INSERT INTO user_game_sources (user_id, provider, provider_app_id, source_status, last_synced_at)
      SELECT ${userId}, 'steam', (50000 + n)::text, 'owned', '2026-01-02T00:00:00Z'
        FROM generate_series(1, 251) n;
      INSERT INTO steam_import_candidates (user_id, steam_app_id, steam_name)
      SELECT ${userId}, (50000 + n)::text, 'Library Game ' || n FROM generate_series(1, 251) n;
    `);
    await pool.query(
      `INSERT INTO user_personal_genres (user_id, name, normalized_name)
       VALUES ($1, 'Roguelike', 'roguelike')`,
      [userId],
    );
    await pool.query(
      `UPDATE catalog_games
          SET metadata_quality = 'full', tags_json = '["Roguelite"]'::jsonb
        WHERE id = 10001`,
    );

    const first = await autoMatchSteamCandidates({ id: userId }, { limit: 250, useCatalogSearch: false });
    assert.deepEqual(first, { reviewed: 250, matched: 250, limit: 250 });
    assert.deepEqual(
      (await pool.query(
        "SELECT personal_genre_suggestions_json FROM steam_import_candidates WHERE user_id=$1 AND steam_app_id='50001'",
        [userId],
      )).rows[0].personal_genre_suggestions_json.map((genre) => genre.name),
      ["Roguelike"],
    );
    assert.equal((await pool.query(
      "SELECT COUNT(*)::int AS count FROM steam_import_candidates WHERE user_id = $1 AND proposed_catalog_game_id IS NULL",
      [userId],
    )).rows[0].count, 1);

    const second = await autoMatchSteamCandidates({ id: userId }, { limit: 250, useCatalogSearch: false });
    assert.deepEqual(second, { reviewed: 1, matched: 1, limit: 250 });
    const noRepeat = await autoMatchSteamCandidates({ id: userId }, { limit: 250, useCatalogSearch: false });
    assert.deepEqual(noRepeat, { reviewed: 0, matched: 0, limit: 250 });

    await pool.query(`
      INSERT INTO catalog_games (id, name) VALUES (20001, 'Interrupted Game');
      INSERT INTO external_game_ids (catalog_game_id, source, external_id) VALUES (20001, 'steam', '80000');
      INSERT INTO user_game_sources (user_id, provider, provider_app_id, source_status, last_synced_at)
      VALUES (${userId}, 'steam', '80000', 'owned', NOW());
      INSERT INTO steam_import_candidates (user_id, steam_app_id, steam_name)
      VALUES (${userId}, '80000', 'Interrupted Game');
    `);
    const interrupted = await autoMatchSteamCandidates(
      { id: userId },
      { limit: 250, useCatalogSearch: false, writeGuard: async () => null },
    );
    assert.deepEqual(interrupted, { reviewed: 1, matched: 0, limit: 250 });
    const recovered = await autoMatchSteamCandidates({ id: userId }, { limit: 250, useCatalogSearch: false });
    assert.deepEqual(recovered, { reviewed: 1, matched: 1, limit: 250 });

    await pool.query(`
      INSERT INTO user_game_sources (user_id, provider, provider_app_id, source_status, last_synced_at)
      VALUES (${userId}, 'steam', '80001', 'owned', NOW());
      INSERT INTO steam_import_candidates (user_id, steam_app_id, steam_name)
      VALUES (${userId}, '80001', 'Retry Later Game');
    `);
    const pendingRetry = await autoMatchSteamCandidates({ id: userId }, { limit: 250, useCatalogSearch: false });
    assert.deepEqual(pendingRetry, { reviewed: 1, matched: 0, limit: 250 });
    await pool.query("INSERT INTO catalog_games (id, name) VALUES (20002, 'Retry Later Game')");
    await pool.query("INSERT INTO external_game_ids (catalog_game_id, source, external_id) VALUES (20002, 'steam', '80001')");
    const retry = await autoMatchSteamCandidates({ id: userId }, { limit: 250, useCatalogSearch: false });
    assert.deepEqual(retry, { reviewed: 1, matched: 1, limit: 250 });

    await pool.query(`
      INSERT INTO catalog_games (id, name) VALUES (20003, 'Replacement Epoch Game');
      INSERT INTO external_game_ids (catalog_game_id, source, external_id) VALUES (20003, 'steam', '80002');
      INSERT INTO user_game_sources (user_id, provider, provider_app_id, source_status, last_synced_at)
      VALUES (${userId}, 'steam', '80002', 'owned', '2026-01-02T00:00:00Z');
      INSERT INTO steam_import_candidates (user_id, steam_app_id, steam_name)
      VALUES (${userId}, '80002', 'Replacement Epoch Game');
      UPDATE user_external_accounts SET disconnected_at = NOW() WHERE id = ${account.id};
      INSERT INTO user_external_accounts (user_id, provider, provider_user_id, linked_at)
      VALUES (${userId}, 'steam', '76561198000001000', NOW());
    `);
    const oldEpoch = await autoMatchSteamCandidates({ id: userId }, { limit: 250, useCatalogSearch: false });
    assert.deepEqual(oldEpoch, { reviewed: 0, matched: 0, limit: 250 });
    await pool.query("UPDATE user_game_sources SET last_synced_at = NOW() WHERE user_id = $1 AND provider_app_id = '80002'", [userId]);
    const currentEpoch = await autoMatchSteamCandidates({ id: userId }, { limit: 250, useCatalogSearch: false });
    assert.deepEqual(currentEpoch, { reviewed: 1, matched: 1, limit: 250 });
  } finally {
    globalThis.fetch = nativeFetch;
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.end();
  }
});
