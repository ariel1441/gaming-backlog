import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const execFileAsync = promisify(execFile);

test("migration 043 preserves candidates and is idempotent through the local runner", { timeout: 60_000 }, async () => {
  const adminUrl = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(adminUrl.hostname));

  const database = `genre_suggestion_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: adminUrl.href });
  let client;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    const targetUrl = new URL(adminUrl.href);
    targetUrl.pathname = `/${database}`;
    client = new pg.Client({ connectionString: targetUrl.href });
    await client.connect();

    await client.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    await client.query(
      "ALTER TABLE steam_import_candidates DROP COLUMN personal_genre_suggestions_json",
    );
    await client.query(`
      CREATE TABLE schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const migrationFiles = await readdir(
      new URL("./migrations", import.meta.url),
    );
    for (const filename of migrationFiles
      .filter((name) => /^\d+_.+\.sql$/.test(name) && name < "043_")) {
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [filename],
      );
    }

    const userId = (
      await client.query(
        "INSERT INTO users (username, password_hash) VALUES ('genre-migration-owner', 'fixture') RETURNING id",
      )
    ).rows[0].id;
    const candidateId = (
      await client.query(
        `INSERT INTO steam_import_candidates (user_id, steam_app_id, steam_name)
         VALUES ($1, '990043', 'Preserved candidate') RETURNING id`,
        [userId],
      )
    ).rows[0].id;
    await client.end();
    client = null;

    await execFileAsync(process.execPath, ["scripts/db-migrate.js"], {
      env: {
        ...process.env,
        DATABASE_URL: targetUrl.href,
        PGSSL: "false",
      },
    });

    client = new pg.Client({ connectionString: targetUrl.href });
    await client.connect();
    const migrated = await client.query(
      `SELECT steam_name, personal_genre_suggestions_json
         FROM steam_import_candidates WHERE id = $1`,
      [candidateId],
    );
    assert.equal(migrated.rows[0].steam_name, "Preserved candidate");
    assert.deepEqual(migrated.rows[0].personal_genre_suggestions_json, []);
    assert.equal(
      (
        await client.query(
          "SELECT COUNT(*)::int AS count FROM schema_migrations WHERE filename = '043_add_steam_candidate_genre_suggestions.sql'",
        )
      ).rows[0].count,
      1,
    );

    const migrationSql = await readFile(
      new URL("./migrations/043_add_steam_candidate_genre_suggestions.sql", import.meta.url),
      "utf8",
    );
    await client.query(migrationSql);
    await assert.rejects(
      client.query(
        `UPDATE steam_import_candidates
            SET personal_genre_suggestions_json = '{}'::jsonb
          WHERE id = $1`,
        [candidateId],
      ),
      (error) => error?.code === "23514",
    );
  } finally {
    await client?.end().catch(() => {});
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
      [database],
    ).catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${database}`).catch(() => {});
    await admin.end();
  }
});
