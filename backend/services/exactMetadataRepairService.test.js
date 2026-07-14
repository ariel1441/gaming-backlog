import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import {
  auditExactMetadataLinks,
  repairExactMetadataLinks,
} from "./exactMetadataRepairService.js";

dotenv.config();

const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/game_backlog";

async function withRepairSchema(work) {
  const admin = new pg.Client({ connectionString });
  const schema = `repair_${crypto.randomUUID().replaceAll("-", "")}`;
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
      max: 2,
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

test("exact metadata repair links only unlinked rows with a unique RAWG identity", async () => {
  await withRepairSchema(async (dbPool) => {
    await dbPool.query(
      `
      INSERT INTO users (id, username, password_hash)
      VALUES
        (1, 'repair-test', 'not-a-real-password'),
        (2, 'collision-test', 'not-a-real-password');
      INSERT INTO statuses (status, rank) VALUES ('playing', 1);

      INSERT INTO catalog_games (id, name, canonical_title, metadata_quality)
      VALUES
        (10, 'Exact 42', 'Exact 42', 'full'),
        (11, 'Exact 99', 'Exact 99', 'full'),
        (12, 'Partial', 'Partial', 'search_result');

      INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
      VALUES
        (10, 'rawg', '42', 'exact-42'),
        (11, 'rawg', '99', 'exact-99');

      INSERT INTO games
        (id, user_id, catalog_game_id, name, status, position, rawg_id)
      VALUES
        (100, 1, NULL, 'Unlinked exact', 'playing', 1000, 42),
        (101, 1, 12, 'Conflicting exact', 'playing', 2000, 99),
        (102, 1, NULL, 'Title only', 'playing', 3000, NULL),
        (200, 2, 10, 'Existing catalog game', 'playing', 1000, NULL),
        (201, 2, NULL, 'Colliding exact', 'playing', 2000, 42);
      `,
    );

    const before = await auditExactMetadataLinks(dbPool);
    assert.equal(before.safely_linkable_exact_games, 1);
    assert.equal(before.owner_catalog_collisions, 1);
    assert.equal(before.conflicting_exact_links, 1);
    assert.equal(before.unlinked_title_only_games, 1);

    const result = await repairExactMetadataLinks(dbPool);
    assert.equal(result.repaired, 1);
    assert.equal(result.after.safely_linkable_exact_games, 0);
    assert.equal(result.after.conflicting_exact_links, 1);

    const { rows } = await dbPool.query(
      "SELECT id, catalog_game_id, rawg_slug FROM games ORDER BY id",
    );
    assert.deepEqual(rows, [
      { id: 100, catalog_game_id: 10, rawg_slug: "exact-42" },
      { id: 101, catalog_game_id: 12, rawg_slug: null },
      { id: 102, catalog_game_id: null, rawg_slug: null },
      { id: 200, catalog_game_id: 10, rawg_slug: null },
      { id: 201, catalog_game_id: null, rawg_slug: null },
    ]);
  });
});
