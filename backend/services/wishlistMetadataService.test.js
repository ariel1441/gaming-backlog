import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import {
  enqueueWishlistMetadataWork,
  getWishlistMetadataStatus,
  nextWishlistMetadataAttempt,
  processNextWishlistMetadataBatch,
  refreshWishlistMetadataItem,
} from "./wishlistMetadataService.js";

dotenv.config();
const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/game_backlog";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname), "Wishlist metadata tests require localhost");

async function withMetadataSchema(work) {
  const admin = new pg.Client({ connectionString });
  const schema = `wishlist_metadata_${crypto.randomUUID().replaceAll("-", "")}`;
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    await admin.query(await fs.readFile(new URL("../schema.sql", import.meta.url), "utf8"));
    await admin.query("SET search_path TO public");
    const db = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 4 });
    try { await work(db); } finally { await db.end(); }
  } finally {
    await admin.query("SET search_path TO public").catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await admin.end();
  }
}

async function seed(db) {
  await db.query(`
    INSERT INTO users (id, username, password_hash) VALUES
      (1, 'metadata-owner', 'not-real'), (2, 'metadata-other', 'not-real');
    INSERT INTO catalog_games (
      id, name, canonical_title, cover_url, metadata_quality, genres_json,
      metadata_source, metadata_fetched_at
    ) VALUES
      (10, 'Known Game', 'Known Game', NULL, 'search_result', '[]', 'rawg', NULL),
      (11, 'Unique Match', 'Unique Match', 'https://img.example/unique.jpg', 'search_result', '[]', 'rawg', NULL),
      (12, 'Other User Game', 'Other User Game', 'https://img.example/other.jpg', 'full', '["Action"]', 'rawg', NOW());
    INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
    VALUES (10, 'rawg', '100', 'known-game'), (11, 'rawg', '101', 'unique-match'), (12, 'rawg', '102', 'other-user-game');
    INSERT INTO user_wishlist_items (id, user_id, catalog_game_id, display_name, release_date)
    VALUES (20, 1, 10, 'Known Game', '2026-01-01'), (21, 1, NULL, 'Ambiguous Game', '2026-01-01'), (22, 1, NULL, 'Unique Match', '2026-01-01');
    INSERT INTO user_wishlist_items (id, user_id, catalog_game_id, display_name)
    VALUES (23, 2, 12, 'Other User Game');
  `);
}

test("Wishlist metadata policy uses measured incomplete, recent, and mature intervals", () => {
  const now = new Date("2026-09-13T00:00:00.000Z");
  assert.equal(
    nextWishlistMetadataAttempt({ now, attemptCount: 1 }).toISOString(),
    "2026-09-16T00:00:00.000Z",
  );
  assert.equal(
    nextWishlistMetadataAttempt({ now, attemptCount: 2 }).toISOString(),
    "2026-09-20T00:00:00.000Z",
  );
  assert.equal(
    nextWishlistMetadataAttempt({ now, metadataComplete: true, releasedAt: "2026-06-01" }).toISOString(),
    "2026-10-13T00:00:00.000Z",
  );
  assert.equal(
    nextWishlistMetadataAttempt({ now, metadataComplete: true, releasedAt: "2012-06-01" }).toISOString(),
    "2027-01-11T00:00:00.000Z",
  );
});

test("Wishlist work is owner-scoped, idempotent, and hydrates one safe RAWG identity", async () => {
  await withMetadataSchema(async (db) => {
    await seed(db);
    const first = await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20, steamAppId: "1000" });
    const second = await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20, steamAppId: "1000" });
    assert.equal(first.wishlist_item_id, second.wishlist_item_id);

    const result = await processNextWishlistMetadataBatch({
      db,
      userId: 1,
      workerId: "wishlist-test-worker",
      now: () => new Date("2026-09-13T00:00:00.000Z"),
      searchCatalogFn: async () => ({ results: [{ id: 11, rawg_id: 101, name: "Unique Match" }] }),
      ingestRawgGameMetadataFn: async (rawgId) => {
        assert.equal(rawgId, 100);
        await db.query(`UPDATE catalog_games SET metadata_quality = 'full', cover_url = 'https://img.example/known.jpg', genres_json = '["RPG"]' WHERE id = 10`);
        return { catalogGame: { id: 10 } };
      },
    });
    assert.equal(result.status, "completed");
    assert.equal((await db.query("SELECT catalog_game_id FROM user_wishlist_items WHERE id = 20")).rows[0].catalog_game_id, 10);
    assert.equal((await db.query("SELECT status, identity_state FROM wishlist_metadata_work WHERE wishlist_item_id = 20")).rows[0].status, "completed");

    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 22, steamAppId: "1001" });
    const searched = await processNextWishlistMetadataBatch({
      db,
      userId: 1,
      workerId: "wishlist-search-worker",
      searchCatalogFn: async (query) => {
        assert.equal(query, "Unique Match");
        return { results: [{ id: 11, rawg_id: 101, name: "Unique Match" }] };
      },
      ingestRawgGameMetadataFn: async (rawgId) => {
        assert.equal(rawgId, 101);
        await db.query(`UPDATE catalog_games SET metadata_quality = 'full', genres_json = '["Adventure"]' WHERE id = 11`);
        return { catalogGame: { id: 11 } };
      },
    });
    assert.equal(searched.status, "completed");
    assert.equal((await db.query("SELECT catalog_game_id FROM user_wishlist_items WHERE id = 22")).rows[0].catalog_game_id, 11);

    const targeted = await refreshWishlistMetadataItem(1, 22, {
      db,
      workerId: "wishlist-targeted-worker",
      searchCatalogFn: async () => ({ results: [] }),
      ingestRawgGameMetadataFn: async () => ({ catalogGame: { id: 11 } }),
    });
    assert.equal(targeted.drain.results[0].wishlistItemId, 22);
    assert.equal(targeted.run.status, "completed");
    assert.equal(targeted.run.processed, 1);
    assert.equal(targeted.run.completed, 1);
    const history = await db.query(
      "SELECT status, identity_state, wishlist_item_id FROM wishlist_metadata_attempts WHERE user_id = 1 ORDER BY id DESC LIMIT 1",
    );
    assert.deepEqual(history.rows[0], {
      status: "completed",
      identity_state: "exact",
      wishlist_item_id: "22",
    });
    assert.equal((await getWishlistMetadataStatus(1, db)).recentRuns[0].id, targeted.run.id);
    await assert.rejects(
      () => refreshWishlistMetadataItem(1, 23, { db }),
      (error) => error.status === 404,
    );

    await assert.rejects(
      () => enqueueWishlistMetadataWork(db, { userId: 2, wishlistItemId: 20, steamAppId: "other" }),
      (error) => error.code === "23514",
    );
  });
});

test("ambiguous title matches stay in review and preserve the Steam fallback", async () => {
  await withMetadataSchema(async (db) => {
    await seed(db);
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 21, steamAppId: "2000" });
    const result = await processNextWishlistMetadataBatch({
      db,
      userId: 1,
      workerId: "wishlist-review-worker",
      searchCatalogFn: async () => ({ results: [
        { id: 30, rawg_id: 301, name: "Ambiguous Game" },
        { id: 31, rawg_id: 302, name: "Ambiguous Game" },
      ] }),
    });
    assert.equal(result.status, "review");
    const item = (await db.query("SELECT catalog_game_id, display_name FROM user_wishlist_items WHERE id = 21")).rows[0];
    assert.equal(item.catalog_game_id, null);
    assert.equal(item.display_name, "Ambiguous Game");
    const work = (await db.query("SELECT status, identity_state, identity_reason, next_attempt_at FROM wishlist_metadata_work WHERE wishlist_item_id = 21")).rows[0];
    assert.deepEqual({ status: work.status, identity_state: work.identity_state, identity_reason: work.identity_reason }, {
      status: "review", identity_state: "ambiguous", identity_reason: "multiple_exact_title_candidates",
    });
    assert.equal(work.next_attempt_at, null);
    const status = await getWishlistMetadataStatus(1, db);
    assert.equal(status.review, 1);
  });
});
