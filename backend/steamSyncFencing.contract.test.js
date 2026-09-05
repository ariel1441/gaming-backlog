import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
dotenv.config();

test(
  "PostgreSQL sync checkpoints roll back with source writes and stale account leases cannot write",
  { timeout: 60000 },
  async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    const database = `steam_fencing_${crypto.randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString: url.href });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${database}`);
    url.pathname = `/${database}`;
    let pool;
    try {
      await promisify(execFile)(process.execPath, ["scripts/db-migrate.js"], {
        env: { ...process.env, DATABASE_URL: url.href, PGSSL: "false" },
      });
      process.env.DATABASE_URL = url.href;
      process.env.PGSSL = "false";
      process.env.NODE_ENV = "test";
      process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({
        response: {
          game_count: 1,
          games: [
            {
              appid: 999999,
              name: "Checkpoint Soundtrack",
              playtime_forever: 10,
            },
          ],
        },
      });
      process.env.STEAM_MOCK_PLAYER_SUMMARY_JSON = JSON.stringify({
        response: { players: [] },
      });
      ({ pool } = await import("./db.js"));
      const sync = await import("./services/steamLibrarySyncService.js");
      const steam = await import("./services/steamService.js");
      const { lockSteamSyncJob } = await import("./services/steamSyncLease.js");
      const userId = (
        await pool.query(
          "INSERT INTO users (username, password_hash) VALUES ('owner', 'x') RETURNING id",
        )
      ).rows[0].id;
      const accountId = (
        await pool.query(
          "INSERT INTO user_external_accounts (user_id, provider, provider_user_id) VALUES ($1, 'steam', '76561190000000000') RETURNING id",
          [userId],
        )
      ).rows[0].id;
      await pool.query(
        "CREATE FUNCTION fail_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.cursor > OLD.cursor THEN RAISE EXCEPTION 'injected checkpoint crash'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_checkpoint BEFORE UPDATE ON steam_sync_jobs FOR EACH ROW EXECUTE FUNCTION fail_checkpoint()",
      );
      const finish = async () =>
        sync.waitForSteamSyncJob(
          userId,
          (await sync.enqueueSteamSync(userId, { force: true })).id,
          { pollMs: 5 },
        );
      assert.equal((await finish()).status, "failed");
      assert.equal(
        (await pool.query("SELECT count(*)::int AS n FROM user_game_sources"))
          .rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM steam_import_candidates",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT last_library_sync_at FROM user_external_accounts",
          )
        ).rows[0].last_library_sync_at,
        null,
      );
      await pool.query("DROP TRIGGER fail_checkpoint ON steam_sync_jobs");
      const done = await finish();
      assert.equal(done.status, "completed");
      assert.equal(done.cursor, 1);
      assert.equal(
        (await pool.query("SELECT count(*)::int AS n FROM games")).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM user_activity_events",
          )
        ).rows[0].n,
        0,
      );
      const progress = (
        await pool.query(
          "SELECT progress_json FROM steam_sync_jobs WHERE id = $1",
          [done.id],
        )
      ).rows[0].progress_json;
      assert.equal(progress.sourceWrites.created, 1);
      assert.equal(progress.newCandidateIds.length, 1);
      const token = crypto.randomUUID(),
        id = crypto.randomUUID();
      await pool.query(
        "INSERT INTO steam_sync_jobs (id, user_id, account_id, provider_user_id, status, lease_token, locked_at) VALUES ($1, $2, $3, '76561190000000000', 'running', $4, NOW())",
        [id, userId, accountId, token],
      );
      const job = { id, lease_token: token };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        assert.equal(
          await lockSteamSyncJob(client, {
            id,
            lease_token: crypto.randomUUID(),
          }),
          null,
        );
        assert.equal((await lockSteamSyncJob(client, job)).id, id);
        await client.query("COMMIT");
        await steam.disconnectSteamAccount(userId);
        await steam.upsertSteamAccount(userId, "76561190000000001");
        await client.query("BEGIN");
        assert.equal(await lockSteamSyncJob(client, job), null);
        await client.query("COMMIT");
        assert.equal(
          (await sync.getSteamSyncJob(userId, id)).status,
          "cancelled",
        );
        assert.equal(
          (await steam.getSteamAccount(userId)).last_library_sync_at,
          null,
        );
      } finally {
        client.release();
      }
    } finally {
      await pool?.end();
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
        [database],
      );
      await admin.query(`DROP DATABASE ${database}`);
      await admin.end();
    }
  },
);
