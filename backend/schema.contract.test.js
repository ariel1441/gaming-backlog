import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

dotenv.config();

const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/game_backlog";
const execFileAsync = promisify(execFile);

async function withTemporaryDatabase(work) {
  const admin = new pg.Client({ connectionString });
  const database = `migration_${crypto.randomUUID().replaceAll("-", "")}`;
  const target = new URL(connectionString);
  target.pathname = `/${database}`;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    await work(target.toString(), database);
  } finally {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
      [database],
    ).catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${database}`).catch(() => {});
    await admin.end();
  }
}

test("fresh schema enforces game identity, dates, metrics, and relationship ownership", async () => {
  const client = new pg.Client({ connectionString });
  const schema = `contract_${crypto.randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    const sql = await fs.readFile(new URL("./schema.sql", import.meta.url), "utf8");
    await client.query(sql);

    await client.query("INSERT INTO statuses (status, rank) VALUES ('contract status', 1)");
    const statusName = "contract status";
    const users = await client.query(
      `INSERT INTO users (username, password_hash) VALUES ('contract_a', 'x'), ('contract_b', 'x') RETURNING id`,
    );
    const [userA, userB] = users.rows.map((row) => row.id);
    const gameA = await client.query(
      "INSERT INTO games (user_id, name, status) VALUES ($1, 'Final Fantasy VII', $2) RETURNING id",
      [userA, statusName],
    );
    const gameB = await client.query(
      "INSERT INTO games (user_id, name, status) VALUES ($1, 'Other Game', $2) RETURNING id",
      [userB, statusName],
    );
    const listA = await client.query(
      "INSERT INTO user_lists (user_id, name) VALUES ($1, 'List A') RETURNING id",
      [userA],
    );

    await assert.rejects(
      client.query(
        "INSERT INTO games (user_id, name, status) VALUES ($1, 'Final Fantasy 7', $2)",
        [userA, statusName],
      ),
      (error) => error.code === "23505",
    );
    await assert.rejects(
      client.query(
        "INSERT INTO games (user_id, name, status, started_at, finished_at) VALUES ($1, 'Bad Dates', $2, '2026-07-12', '2026-07-11')",
        [userA, statusName],
      ),
      (error) => error.code === "23514",
    );
    await assert.rejects(
      client.query(
        "INSERT INTO user_list_games (list_id, game_id) VALUES ($1, $2)",
        [listA.rows[0].id, gameB.rows[0].id],
      ),
      (error) => error.code === "23514",
    );
    await assert.rejects(
      client.query(
        "INSERT INTO user_game_sources (user_id, game_id, provider, provider_app_id, playtime_minutes_forever) VALUES ($1, $2, 'steam', '10', -1)",
        [userA, gameA.rows[0].id],
      ),
      (error) => error.code === "23514",
    );
    await client.query(
      "INSERT INTO user_list_games (list_id, game_id) VALUES ($1, $2)",
      [listA.rows[0].id, gameA.rows[0].id],
    );
    await assert.rejects(
      client.query("UPDATE games SET user_id = $1 WHERE id = $2", [userB, gameA.rows[0].id]),
      (error) => error.code === "23514",
    );
    await assert.rejects(
      client.query("UPDATE user_lists SET user_id = $1 WHERE id = $2", [userB, listA.rows[0].id]),
      (error) => error.code === "23514",
    );
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
});

test("ordered migrations bootstrap an empty database and status stays read-only", async () => {
  await withTemporaryDatabase(async (target) => {
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const migrationsDir = path.join(root, "backend", "migrations");
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();

    await execFileAsync(process.execPath, [path.join(root, "scripts", "db-migrate.js"), "--status"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: target, PGSSL: "false" },
    });
    const before = new pg.Client({ connectionString: target });
    await before.connect();
    assert.equal(
      (await before.query("SELECT to_regclass('schema_migrations') AS name")).rows[0].name,
      null,
    );
    await before.end();

    await execFileAsync(process.execPath, [path.join(root, "scripts", "db-migrate.js")], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: target, PGSSL: "false" },
    });

    const client = new pg.Client({ connectionString: target });
    await client.connect();
    try {
      assert.equal(
        Number((await client.query("SELECT COUNT(*) FROM schema_migrations")).rows[0].count),
        files.length,
      );
      assert.equal(
        (await client.query("SELECT to_regclass('games') AS name")).rows[0].name,
        "games",
      );
      assert.ok(
        (await client.query("SELECT COUNT(*)::int AS count FROM statuses")).rows[0].count > 0,
      );
    } finally {
      await client.end();
    }
  });
});
