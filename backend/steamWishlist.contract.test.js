import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();
const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const adminUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/game_backlog";

async function temporaryDatabase() {
  const database = `wishlist_contract_${crypto.randomUUID().replaceAll("-", "")}`;
  const target = new URL(adminUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("Contract tests require localhost");
  target.pathname = `/${database}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  return {
    url: target.toString(),
    async cleanup() {
      await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [database]).catch(() => {});
      await admin.query(`DROP DATABASE IF EXISTS ${database}`).catch(() => {});
      await admin.end();
    },
  };
}

function payload(items) {
  const enrichedItems = items.map((item) => ({
    ...item,
    name: item.name || `Wishlist Game ${item.appid}`,
    genres: item.genres || ["Adventure"],
    coverUrl: item.coverUrl || `https://cdn.example/${item.appid}.jpg`,
  }));
  return JSON.stringify({
    wishlist: { response: { items: enrichedItems } },
    count: { response: { count: items.length } },
  });
}

test("wishlist sync preserves baselines, removals, events, and user isolation", { timeout: 120_000 }, async () => {
  const database = await temporaryDatabase();
  let appPool;
  try {
    await execFileAsync(process.execPath, [path.join(root, "scripts", "db-migrate.js")], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: database.url, PGSSL: "false" },
    });
    process.env.DATABASE_URL = database.url;
    process.env.PGSSL = "false";
    process.env.NODE_ENV = "test";
    process.env.STEAM_MOCK_WISHLIST_JSON = payload([
      { appid: 10, priority: 0, date_added: 1_700_000_000 },
      { appid: 20, priority: 1, date_added: 1_700_000_100 },
    ]);
    const { pool } = await import("./db.js");
    appPool = pool;
    const sync = await import("./services/steamLibrarySyncService.js");
    const wishlist = await import("./services/steamWishlistService.js");
    const users = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, 'x'), ($2, 'x') RETURNING id",
      [`wishlist_${crypto.randomUUID()}`, `wishlist_other_${crypto.randomUUID()}`],
    );
    const [userId, otherUserId] = users.rows.map((row) => row.id);
    await pool.query(
      `INSERT INTO user_external_accounts (user_id, provider, provider_user_id, sync_status, visibility_state)
       VALUES ($1, 'steam', $2, 'linked', 3)`,
      [userId, `7656119${String(userId).padStart(10, "0")}`],
    );

    const finish = async (queued) => {
      let job = queued;
      for (let attempt = 0; attempt < 100 && ["queued", "running"].includes(job.status); attempt += 1) {
        await sync.runSteamSyncJobs();
        job = await sync.getSteamSyncJob(userId, queued.id);
      }
      return job;
    };

    const baseline = await finish(await sync.enqueueSteamSync(userId, { syncKind: "wishlist" }));
    assert.equal(baseline.status, "completed");
    assert.equal(baseline.run.syncKind, "wishlist");
    assert.equal((await wishlist.listWishlistItems(userId)).total, 2);
    assert.equal(Number((await pool.query("SELECT COUNT(*) FROM games WHERE user_id = $1", [userId])).rows[0].count), 0);
    assert.equal(Number((await pool.query("SELECT COUNT(*) FROM user_activity_events WHERE user_id = $1", [userId])).rows[0].count), 0);

    process.env.STEAM_MOCK_WISHLIST_JSON = payload([
      { appid: 10, priority: 1, date_added: 1_700_000_000 },
      { appid: 30, priority: 0, date_added: 1_700_000_200 },
    ]);
    const changed = await finish(await sync.enqueueSteamSync(userId, { syncKind: "wishlist" }));
    assert.deepEqual(changed.result.summary, {
      total: 2,
      added: 1,
      removed: 1,
      priorityChanged: 1,
      baselineAdvanced: true,
      metadata: { expected: 2, named: 2, covered: 2, tagged: 2, failedPages: [], complete: true },
    });
    const history = await wishlist.listWishlistItems(userId, { active: "all" });
    assert.equal(history.total, 3);
    assert.equal(history.items.find((item) => item.steamAppId === "20").steamActive, false);
    const eventTypes = (await pool.query("SELECT event_type FROM user_activity_events WHERE user_id = $1 ORDER BY event_type", [userId])).rows.map((row) => row.event_type);
    assert.deepEqual(eventTypes, ["wishlist_added", "wishlist_priority_changed", "wishlist_removed"]);

    await pool.query(
      "UPDATE user_wishlist_items SET display_name = 'Steam App 10', cover_url = NULL WHERE user_id = $1 AND display_name = 'Wishlist Game 10'",
      [userId],
    );
    await finish(await sync.enqueueSteamSync(userId, { syncKind: "wishlist" }));
    const repaired = await pool.query(
      "SELECT display_name, cover_url FROM user_wishlist_items WHERE user_id = $1 AND display_name = 'Wishlist Game 10'",
      [userId],
    );
    assert.equal(repaired.rows[0].cover_url, "https://cdn.example/10.jpg");
    assert.equal(Number((await pool.query("SELECT COUNT(*) FROM user_activity_events WHERE user_id = $1", [userId])).rows[0].count), 3);

    process.env.STEAM_MOCK_WISHLIST_JSON = JSON.stringify({ response: {} });
    const ambiguous = await finish(await sync.enqueueSteamSync(userId, { syncKind: "wishlist" }));
    assert.equal(ambiguous.result.needsEmptyConfirmation, true);
    assert.equal((await wishlist.listWishlistItems(userId)).total, 2);
    await finish(await sync.enqueueSteamSync(userId, { syncKind: "wishlist", force: true }));
    assert.equal((await wishlist.listWishlistItems(userId)).total, 2, "confirmation cannot turn an ambiguous response into removals");
    process.env.STEAM_MOCK_WISHLIST_JSON = payload([]);
    await finish(await sync.enqueueSteamSync(userId, { syncKind: "wishlist", force: true }));
    assert.equal((await wishlist.listWishlistItems(userId)).total, 0);

    const ownedItem = history.items[0];
    await assert.rejects(
      pool.query("UPDATE user_wishlist_items SET user_id = $2 WHERE id = $1", [ownedItem.id, otherUserId]),
      (error) => error.code === "23514",
    );
    await sync.runSteamSyncJobs();
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    await appPool?.end().catch(() => {});
    await database.cleanup();
  }
});
