import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

test("Notification Lab supports the real inbox lookup/action path and a clean repeated seed", { timeout: 60_000 }, async () => {
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
    const { listActivityInbox } = await import("./services/activityInboxService.js");
    const { applySteamStatusSuggestion } = await import("./services/steamService.js");
    const { lookupOwnedGamesQuery } = await import("./utils/gameAccess.js");
    const inbox = await listActivityInbox(userId, { section: "attention", limit: 20 });
    const existingGameEvent = inbox.groups
      .flatMap((group) => group.events)
      .find((event) => event.externalId === "9900000004");
    assert.ok(existingGameEvent?.gameId);

    const lookup = lookupOwnedGamesQuery(userId, {
      gameId: existingGameEvent.gameId,
      limit: 1,
    });
    const lookupResult = await pool.query(lookup.text, lookup.values);
    assert.deepEqual(
      lookupResult.rows.map((game) => Number(game.id)),
      [Number(existingGameEvent.gameId)],
    );

    const accepted = await applySteamStatusSuggestion(
      userId,
      Number(existingGameEvent.gameId),
      {
        status: "playing",
        activityEventId: Number(existingGameEvent.id),
      },
    );
    assert.equal(accepted.game.status, "playing");
    assert.equal(accepted.activityEventResolved, true);

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
