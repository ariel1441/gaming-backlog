import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

test("Notification Lab reset removes every reserved Steam source before a repeated seed", { timeout: 60_000 }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const database = `notification_lab_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.href });
  let pool;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    url.pathname = `/${database}`;
    Object.assign(process.env, { DATABASE_URL: url.href, PGSSL: "false", NODE_ENV: "test" });
    ({ pool } = await import("./db.js"));
    await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    await pool.query("INSERT INTO statuses (status, rank) VALUES ('plan to play', 1), ('playing', 2)");
    const userId = (
      await pool.query("INSERT INTO users (username, password_hash) VALUES ('notification-lab-owner', 'fixture') RETURNING id")
    ).rows[0].id;
    await pool.query(
      `INSERT INTO user_personal_genres (user_id, name, normalized_name)
       VALUES ($1, 'Roguelike', 'roguelike'), ($1, 'Action', 'action')`,
      [userId],
    );
    const lab = await import("./services/notificationLabService.js");

    await lab.seedNotificationLab(userId, "all");
    await lab.resetNotificationLab(userId);
    const repeated = await lab.seedNotificationLab(userId, "all");

    assert.equal(repeated.seeded.length, 11);
    assert.equal(
      (await pool.query(
        "SELECT COUNT(*)::int AS count FROM user_game_sources WHERE user_id = $1 AND provider = 'steam'",
        [userId],
      )).rows[0].count,
      5,
    );
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
});
