import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import {
  decideMetadataCandidate,
  enqueueMetadataRepair,
  getLatestMetadataRepair,
  listMetadataCandidates,
  processNextMetadataRepairBatch,
} from "./metadataRepairService.js";

dotenv.config();
const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/game_backlog";

async function withRepairSchema(work) {
  const admin = new pg.Client({ connectionString });
  const schema = `metadata_job_${crypto.randomUUID().replaceAll("-", "")}`;
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    await admin.query(
      await fs.readFile(new URL("../schema.sql", import.meta.url), "utf8"),
    );
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

async function seed(db) {
  await db.query(`
    INSERT INTO users (id, username, password_hash)
    VALUES
      (1, 'repair-owner', 'not-real'),
      (2, 'other-owner', 'not-real');
    INSERT INTO statuses (status, rank) VALUES ('playing', 1);
    INSERT INTO catalog_games (
      id, name, canonical_title, cover_url, metadata_quality, metadata_source
    ) VALUES
      (10, 'Exact Local', 'Exact Local', 'https://img.example/10.jpg', 'full', 'rawg'),
      (11, 'Provider Result', 'Provider Result', 'https://img.example/11.jpg', 'search_result', 'rawg'),
      (12, 'Wrong Edition', 'Wrong Edition', NULL, 'search_result', 'rawg');
    INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
    VALUES
      (10, 'rawg', '100', 'exact-local'),
      (11, 'rawg', '101', 'provider-result'),
      (12, 'rawg', '102', 'wrong-edition');
    INSERT INTO games (id, user_id, name, status, position)
    VALUES
      (20, 1, 'Exact Local', 'playing', 1000),
      (21, 1, 'Needs Provider Search', 'playing', 2000),
      (30, 2, 'Other Private Game', 'playing', 1000);
  `);
}

test("repair jobs are resumable, budgeted, and owner-scoped", async () => {
  await withRepairSchema(async (db) => {
    await seed(db);
    const first = await enqueueMetadataRepair(1, db);
    const reused = await enqueueMetadataRepair(1, db);
    assert.equal(first.id, reused.id);
    assert.equal(first.totalCount, 2);

    let searches = 0;
    const batch = await processNextMetadataRepairBatch({
      db,
      batchSize: 10,
      workerId: "test-worker",
      searchCatalogFn: async (query) => {
        searches += 1;
        assert.equal(query, "Needs Provider Search");
        return {
          source: "rawg",
          results: [
            {
              id: 11,
              rawg_id: 101,
              name: "Provider Result",
              cover: "https://img.example/11.jpg",
            },
          ],
        };
      },
    });
    assert.equal(batch.processed, 2);
    assert.equal(searches, 1);
    await processNextMetadataRepairBatch({ db, workerId: "test-worker-2" });

    const status = await getLatestMetadataRepair(1, db);
    assert.equal(status.job.status, "completed");
    assert.equal(status.job.processedCount, 2);
    assert.equal(status.job.reviewCount, 2);
    assert.equal(status.pendingCandidateCount, 2);

    const ownerCandidates = await listMetadataCandidates(1, {}, db);
    const otherCandidates = await listMetadataCandidates(2, {}, db);
    assert.equal(ownerCandidates.length, 2);
    assert.equal(otherCandidates.length, 0);
    assert.deepEqual(
      ownerCandidates.map((candidate) => candidate.gameId),
      [20, 21],
    );
  });
});

test("candidate decisions link only the owning game and preserve alternatives", async () => {
  await withRepairSchema(async (db) => {
    await seed(db);
    await db.query(`
      INSERT INTO game_metadata_candidates (
        user_id, game_id, catalog_game_id, provider, provider_game_id,
        candidate_rank, confidence_level
      ) VALUES
        (1, 20, 10, 'rawg', '100', 1, 'high'),
        (1, 20, 12, 'rawg', '102', 2, 'medium');
    `);
    const candidates = await listMetadataCandidates(1, {}, db);
    const accepted = await decideMetadataCandidate(
      1,
      candidates[0].id,
      "accept",
      {
        db,
        ingestRawgGameMetadata: async () => ({
          catalogGame: { id: 10, slug: "exact-local" },
        }),
      },
    );
    assert.equal(accepted.catalogGameId, 10);

    const game = await db.query(
      "SELECT catalog_game_id, rawg_id, rawg_slug FROM games WHERE id = 20",
    );
    assert.deepEqual(game.rows[0], {
      catalog_game_id: 10,
      rawg_id: 100,
      rawg_slug: "exact-local",
    });
    const decisions = await db.query(
      "SELECT provider_game_id, decision FROM game_metadata_candidates ORDER BY candidate_rank",
    );
    assert.deepEqual(decisions.rows, [
      { provider_game_id: "100", decision: "accepted" },
      { provider_game_id: "102", decision: "rejected" },
    ]);

    await assert.rejects(
      () => decideMetadataCandidate(2, candidates[0].id, "reject", { db }),
      (error) => error.status === 404,
    );
  });
});
