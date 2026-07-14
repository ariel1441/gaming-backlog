import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import {
  MetadataIngestionError,
  canonicalProviderPayload,
  createMetadataIngestionService,
  providerPayloadHash,
} from "./metadataIngestionService.js";

dotenv.config();

const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/game_backlog";

function rawgDetail(id, overrides = {}) {
  return {
    id,
    slug: `game-${id}`,
    name: `Game ${id}`,
    description: "<p>Full description</p><script>bad()</script>",
    background_image: `https://img.example/${id}.jpg`,
    released: "2024-01-02",
    rating: 4.25,
    metacritic: 88,
    playtime: 12,
    genres: [{ id: 1, name: "Action" }],
    stores: [
      {
        id: 10,
        url: "https://store.example/game",
        store: { id: 1, name: "Example Store" },
      },
    ],
    tags: [{ id: 1, name: "Singleplayer" }],
    ...overrides,
  };
}

async function withMetadataSchema(work) {
  const admin = new pg.Client({ connectionString });
  const schema = `metadata_${crypto.randomUUID().replaceAll("-", "")}`;
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    const sql = await fs.readFile(new URL("../schema.sql", import.meta.url), "utf8");
    await admin.query(sql);
    await admin.query("SET search_path TO public");

    const dbPool = new pg.Pool({
      connectionString,
      options: `-c search_path=${schema}`,
      max: 4,
    });
    try {
      await work(dbPool);
    } finally {
      await dbPool.end();
    }
  } finally {
    await admin.query("SET search_path TO public").catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await admin.end();
  }
}

test("provider payload hashing is stable across object key order", () => {
  const first = { id: 42, nested: { z: 1, a: 2 }, values: [2, 1] };
  const second = { values: [2, 1], nested: { a: 2, z: 1 }, id: 42 };
  assert.equal(canonicalProviderPayload(first), canonicalProviderPayload(second));
  assert.equal(providerPayloadHash(first), providerPayloadHash(second));
});

test("exact RAWG ingestion persists, reuses, refreshes safely, and records failures", async () => {
  await withMetadataSchema(async (dbPool) => {
    let response = rawgDetail(42);
    let providerError = null;
    let fetchCount = 0;
    const service = createMetadataIngestionService({
      dbPool,
      fetchRawgDetail: async () => {
        fetchCount += 1;
        if (providerError) throw providerError;
        return response;
      },
      now: () => new Date("2026-07-14T12:00:00.000Z"),
    });

    const created = await service.ingestRawgGame(42);
    assert.equal(created.providerFetched, true);
    assert.equal(created.reused, false);
    assert.equal(created.snapshotStored, true);
    assert.equal(fetchCount, 1);

    const stored = await dbPool.query(
      `
      SELECT cg.*, external.external_id,
             (SELECT COUNT(*)::int
                FROM catalog_provider_snapshots snapshot
               WHERE snapshot.catalog_game_id = cg.id) AS snapshot_count
        FROM catalog_games cg
        JOIN external_game_ids external ON external.catalog_game_id = cg.id
       WHERE external.source = 'rawg' AND external.external_id = '42'
      `,
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].metadata_quality, "full");
    assert.equal(stored.rows[0].cover_source, "rawg");
    assert.equal(stored.rows[0].cover_url, "https://img.example/42.jpg");
    assert.equal(stored.rows[0].description_html, "<p>Full description</p>");
    assert.deepEqual(stored.rows[0].genres_json, ["Action"]);
    assert.equal(stored.rows[0].snapshot_count, 1);

    const reused = await service.ingestRawgGame(42);
    assert.equal(reused.providerFetched, false);
    assert.equal(reused.reused, true);
    assert.equal(reused.snapshotStored, false);
    assert.equal(fetchCount, 1);

    response = rawgDetail(42, {
      background_image: null,
      description: null,
      released: null,
      rating: 4.75,
      metacritic: null,
      playtime: null,
      genres: [],
      stores: [],
      tags: [],
    });
    const refreshed = await service.ingestRawgGame(42, { force: true });
    assert.equal(refreshed.providerFetched, true);
    assert.equal(refreshed.reused, true);
    assert.equal(refreshed.snapshotStored, true);
    assert.equal(fetchCount, 2);

    const afterRefresh = await dbPool.query(
      `
      SELECT cg.*,
             (SELECT COUNT(*)::int
                FROM catalog_provider_snapshots snapshot
               WHERE snapshot.catalog_game_id = cg.id) AS snapshot_count
        FROM catalog_games cg
       WHERE cg.id = $1
      `,
      [created.catalogGame.id],
    );
    assert.equal(afterRefresh.rows[0].cover_url, "https://img.example/42.jpg");
    assert.equal(afterRefresh.rows[0].description_html, "<p>Full description</p>");
    assert.equal(Number(afterRefresh.rows[0].rawg_rating), 4.75);
    assert.equal(afterRefresh.rows[0].metacritic, 88);
    assert.deepEqual(afterRefresh.rows[0].genres_json, ["Action"]);
    assert.equal(afterRefresh.rows[0].snapshot_count, 2);

    providerError = Object.assign(new Error("provider secret should not persist"), {
      code: "rawg_rate_limited",
    });
    await assert.rejects(
      service.ingestRawgGame(42, { force: true }),
      (error) => error.code === "rawg_rate_limited",
    );
    const failed = await dbPool.query(
      `SELECT metadata_failure_reason, description_html
         FROM catalog_games
        WHERE id = $1`,
      [created.catalogGame.id],
    );
    assert.equal(failed.rows[0].metadata_failure_reason, "rawg_rate_limited");
    assert.equal(failed.rows[0].description_html, "<p>Full description</p>");
  });
});

test("exact RAWG ingestion rejects identity mismatches without creating catalog data", async () => {
  await withMetadataSchema(async (dbPool) => {
    const service = createMetadataIngestionService({
      dbPool,
      fetchRawgDetail: async () => rawgDetail(100),
    });
    await assert.rejects(
      service.ingestRawgGame(99),
      (error) =>
        error instanceof MetadataIngestionError &&
        error.code === "rawg_identity_mismatch",
    );
    const counts = await dbPool.query(
      "SELECT COUNT(*)::int AS count FROM catalog_games",
    );
    assert.equal(counts.rows[0].count, 0);
  });
});

test("concurrent exact RAWG ingestion coalesces provider and database work", async () => {
  await withMetadataSchema(async (dbPool) => {
    let fetchCount = 0;
    const service = createMetadataIngestionService({
      dbPool,
      fetchRawgDetail: async () => {
        fetchCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return rawgDetail(77);
      },
    });

    const [first, second] = await Promise.all([
      service.ingestRawgGame(77),
      service.ingestRawgGame(77),
    ]);
    assert.equal(fetchCount, 1);
    assert.equal(first.catalogGame.id, second.catalogGame.id);

    const counts = await dbPool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM catalog_games) AS catalog_count,
        (SELECT COUNT(*)::int FROM external_game_ids) AS external_count,
        (SELECT COUNT(*)::int FROM catalog_provider_snapshots) AS snapshot_count
    `);
    assert.deepEqual(counts.rows[0], {
      catalog_count: 1,
      external_count: 1,
      snapshot_count: 1,
    });
  });
});

test("exact RAWG ingestion bounds provider concurrency across different identities", async () => {
  await withMetadataSchema(async (dbPool) => {
    let active = 0;
    let maxActive = 0;
    const service = createMetadataIngestionService({
      dbPool,
      providerConcurrency: 1,
      fetchRawgDetail: async (id) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 25));
        active -= 1;
        return rawgDetail(id);
      },
    });

    await Promise.all([
      service.ingestRawgGame(201),
      service.ingestRawgGame(202),
    ]);
    assert.equal(maxActive, 1);
  });
});

test("catalog projection and provider snapshot persistence are atomic", async () => {
  await withMetadataSchema(async (dbPool) => {
    await dbPool.query(`
      CREATE FUNCTION reject_snapshot_insert()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'snapshot insert rejected for contract test';
      END $$;

      CREATE TRIGGER reject_snapshot_insert
      BEFORE INSERT ON catalog_provider_snapshots
      FOR EACH ROW EXECUTE FUNCTION reject_snapshot_insert();
    `);

    const service = createMetadataIngestionService({
      dbPool,
      fetchRawgDetail: async () => rawgDetail(303),
    });
    await assert.rejects(service.ingestRawgGame(303));

    const counts = await dbPool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM catalog_games) AS catalog_count,
        (SELECT COUNT(*)::int FROM external_game_ids) AS external_count,
        (SELECT COUNT(*)::int FROM catalog_provider_snapshots) AS snapshot_count
    `);
    assert.deepEqual(counts.rows[0], {
      catalog_count: 0,
      external_count: 0,
      snapshot_count: 0,
    });
  });
});
