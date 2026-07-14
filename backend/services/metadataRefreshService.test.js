import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import {
  enqueueCatalogRefresh,
  nextCatalogRefreshAt,
  nextCatalogRefreshRetryAt,
  processNextCatalogRefreshBatch,
  startCatalogRefreshScheduler,
} from "./metadataRefreshService.js";

dotenv.config();
const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/game_backlog";

async function withRefreshSchema(work) {
  const admin = new pg.Client({ connectionString });
  const schema = `metadata_refresh_${crypto.randomUUID().replaceAll("-", "")}`;
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    await admin.query(await fs.readFile(new URL("../schema.sql", import.meta.url), "utf8"));
    await admin.query("SET search_path TO public");
    const db = new pg.Pool({
      connectionString,
      options: `-c search_path=${schema}`,
      max: 4,
    });
    try {
      await work(db);
    } finally {
      await db.end();
    }
  } finally {
    await admin.query("SET search_path TO public").catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await admin.end();
  }
}

async function seedCatalog(db) {
  await db.query(`
    INSERT INTO users (id, username, password_hash)
    VALUES (1, 'refresh-owner', 'not-real');
    INSERT INTO statuses (status, rank) VALUES ('playing', 1);
    INSERT INTO catalog_games (
      id, name, canonical_title, cover_url, cover_source, cover_pinned,
      released_at, description_html, rawg_rating, metadata_quality,
      metadata_source, metadata_fetched_at
    ) VALUES
      (10, 'Old Game', 'Old Game', 'https://img.example/old.jpg', 'rawg', TRUE,
       '2010-01-01', 'Keep this', 3.5, 'full', 'rawg', NOW() - INTERVAL '1 year'),
      (11, 'Recent Game', 'Recent Game', NULL, NULL, FALSE,
       CURRENT_DATE - 30, 'Existing description', 4.0, 'full', 'rawg', NOW() - INTERVAL '1 year'),
      (12, 'Not Due', 'Not Due', NULL, NULL, FALSE,
       '2015-01-01', 'Stable', 4.2, 'full', 'rawg', NOW());
    UPDATE catalog_games SET metadata_next_refresh_at = NOW() + INTERVAL '30 days' WHERE id = 12;
    INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
    VALUES
      (10, 'rawg', '100', 'old-game'),
      (11, 'rawg', '101', 'recent-game'),
      (12, 'rawg', '102', 'not-due');
    INSERT INTO games (id, user_id, name, status, position, catalog_game_id)
    VALUES
      (20, 1, 'Old Game', 'playing', 1000, 10),
      (21, 1, 'Recent Game', 'playing', 2000, 11),
      (22, 1, 'Not Due', 'playing', 3000, 12);
  `);
}

test("refresh freshness and retry policies use bounded intervals", () => {
  const now = new Date("2026-07-14T00:00:00.000Z");
  assert.equal(nextCatalogRefreshAt({ released_at: "2027-01-01" }, now).toISOString(), "2026-07-21T00:00:00.000Z");
  assert.equal(nextCatalogRefreshAt({ released_at: "2026-06-01" }, now).toISOString(), "2026-08-04T00:00:00.000Z");
  assert.equal(nextCatalogRefreshAt({ released_at: "2010-01-01" }, now).toISOString(), "2026-11-11T00:00:00.000Z");
  assert.equal(nextCatalogRefreshAt({}, now).toISOString(), "2026-08-13T00:00:00.000Z");
  assert.equal(nextCatalogRefreshRetryAt(1, now).toISOString(), "2026-07-14T06:00:00.000Z");
  assert.equal(nextCatalogRefreshRetryAt(99, now).toISOString(), "2026-07-21T00:00:00.000Z");
});

test("catalog refresh jobs are resumable and bounded by provider budget", async () => {
  await withRefreshSchema(async (db) => {
    await seedCatalog(db);
    const first = await enqueueCatalogRefresh({ maxItems: 10, providerBudget: 2 }, db);
    const reused = await enqueueCatalogRefresh({ maxItems: 10, providerBudget: 2 }, db);
    assert.equal(first.id, reused.id);
    assert.equal(first.totalCount, 2);

    const calls = [];
    const ingest = async (rawgId, options) => {
      calls.push(Number(rawgId));
      assert.deepEqual(options, { force: true });
      const row = await db.query("SELECT * FROM catalog_games WHERE id = $1", [Number(rawgId) - 90]);
      return { catalogGame: row.rows[0] };
    };
    const batchOne = await processNextCatalogRefreshBatch({ db, batchSize: 1, workerId: "refresh-one", ingestRawgGameMetadataFn: ingest });
    assert.equal(batchOne.completed, false);
    const batchTwo = await processNextCatalogRefreshBatch({ db, batchSize: 1, workerId: "refresh-two", ingestRawgGameMetadataFn: ingest });
    assert.equal(batchTwo.completed, true);
    assert.deepEqual(calls, [100, 101]);

    const job = await db.query("SELECT * FROM metadata_jobs WHERE id = $1", [first.id]);
    assert.equal(job.rows[0].status, "completed");
    assert.equal(job.rows[0].processed_count, 2);
    assert.equal(job.rows[0].linked_count, 2);
    assert.equal(job.rows[0].failed_count, 0);
    const refreshed = await db.query("SELECT id, metadata_next_refresh_at FROM catalog_games ORDER BY id");
    assert.ok(refreshed.rows[0].metadata_next_refresh_at);
    assert.ok(refreshed.rows[1].metadata_next_refresh_at);
    assert.ok(refreshed.rows[2].metadata_next_refresh_at);
  });
});

test("refresh failure preserves good metadata and schedules a retry", async () => {
  await withRefreshSchema(async (db) => {
    await seedCatalog(db);
    const job = await enqueueCatalogRefresh({ maxItems: 1, providerBudget: 1 }, db);
    await processNextCatalogRefreshBatch({
      db,
      batchSize: 1,
      workerId: "refresh-failure",
      now: () => new Date("2026-07-14T00:00:00.000Z"),
      ingestRawgGameMetadataFn: async () => {
        const error = new Error("provider unavailable");
        error.code = "rawg_unavailable";
        throw error;
      },
    });
    const catalog = await db.query(`SELECT cover_url, cover_pinned, description_html, rawg_rating, metadata_failure_reason, metadata_next_refresh_at FROM catalog_games WHERE id = 10`);
    assert.equal(catalog.rows[0].cover_url, "https://img.example/old.jpg");
    assert.equal(catalog.rows[0].cover_pinned, true);
    assert.equal(catalog.rows[0].description_html, "Keep this");
    assert.equal(Number(catalog.rows[0].rawg_rating), 3.5);
    assert.equal(catalog.rows[0].metadata_failure_reason, "rawg_unavailable");
    assert.equal(catalog.rows[0].metadata_next_refresh_at.toISOString(), "2026-07-14T06:00:00.000Z");
    const storedJob = await db.query("SELECT * FROM metadata_jobs WHERE id = $1", [job.id]);
    assert.equal(storedJob.rows[0].status, "completed");
    assert.equal(storedJob.rows[0].failed_count, 1);
  });
});

test("catalog refresh scheduler is inert unless explicitly enabled", () => {
  const stop = startCatalogRefreshScheduler({ enabled: false });
  assert.equal(typeof stop, "function");
  stop();
});
