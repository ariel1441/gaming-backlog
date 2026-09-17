import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import { createMetadataIngestionService } from "./metadataIngestionService.js";
import {
  enqueueWishlistMetadataWork,
  getWishlistMetadataStatus,
  nextWishlistMetadataAttempt,
  processNextWishlistMetadataBatch,
  refreshWishlistMetadataItem,
  selectWishlistRawgMatch,
  drainWishlistMetadataQueue,
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

test("metadata batches give a new Wishlist item a first attempt without starving due retries", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    await completeCatalog(db, 10);
    await completeCatalog(db, 11);
    await db.query("UPDATE user_wishlist_items SET catalog_game_id=11 WHERE id=22");
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20 });
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 22 });
    await db.query(`UPDATE wishlist_metadata_work
      SET status='failed', attempt_count=3, next_attempt_at=NOW()-INTERVAL '1 day'
      WHERE wishlist_item_id=20`);

    const mixed = await drainWishlistMetadataQueue({
      db,
      userId: 1,
      maxItems: 2,
      searchCatalogFn: noSearch,
      ingestRawgGameMetadataFn: noIngestion,
    });
    assert.deepEqual(mixed.results.map(result => result.wishlistItemId), [22, 20]);

    await db.query(`
      INSERT INTO catalog_games (id, name, canonical_title, cover_url, metadata_quality, genres_json, metadata_source, metadata_fetched_at)
      VALUES
        (13, 'Fresh Queue One', 'Fresh Queue One', 'https://img.example/one.jpg', 'full', '["Action"]', 'rawg', NOW()),
        (14, 'Fresh Queue Two', 'Fresh Queue Two', 'https://img.example/two.jpg', 'full', '["RPG"]', 'rawg', NOW());
      INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
      VALUES (13, 'rawg', '103', 'fresh-queue-one'), (14, 'rawg', '104', 'fresh-queue-two');
      INSERT INTO user_wishlist_items (id, user_id, catalog_game_id, display_name)
      VALUES (24, 1, 13, 'Fresh Queue One'), (25, 1, 14, 'Fresh Queue Two')
    `);
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 24 });
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 25 });
    await db.query("UPDATE wishlist_metadata_work SET next_attempt_at=NOW()+INTERVAL '1 day' WHERE wishlist_item_id IN (20, 22)");

    const freshOnly = await drainWishlistMetadataQueue({
      db,
      userId: 1,
      maxItems: 2,
      searchCatalogFn: noSearch,
      ingestRawgGameMetadataFn: noIngestion,
    });
    assert.deepEqual(freshOnly.results.map(result => result.wishlistItemId), [24, 25]);
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

test("manual Wishlist RAWG selection links only the owned Wishlist item", async () => {
  await withMetadataSchema(async (db) => {
    await seed(db);
    await db.query(`
      INSERT INTO catalog_games (
        id, name, canonical_title, cover_url, metadata_quality, genres_json,
        metadata_source, metadata_fetched_at
      ) VALUES (30, 'Ambiguous Game', 'Ambiguous Game', 'https://img.example/ambiguous.jpg', 'full', '["Action"]', 'rawg', NOW());
      INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
      VALUES (30, 'rawg', '301', 'ambiguous-game');
    `);

    const result = await selectWishlistRawgMatch(1, 21, 301, {
      db,
      ingestRawgGameMetadata: async (rawgId) => {
        assert.equal(rawgId, 301);
        return { catalogGame: { id: 30 } };
      },
    });
    assert.deepEqual(result, {
      wishlistItemId: 21,
      catalogGameId: 30,
      rawgId: 301,
      metadataComplete: true,
    });
    assert.equal(
      (await db.query("SELECT catalog_game_id FROM user_wishlist_items WHERE id = 21")).rows[0].catalog_game_id,
      30,
    );
    assert.equal(
      (await db.query("SELECT status, identity_reason FROM wishlist_metadata_work WHERE wishlist_item_id = 21")).rows[0].status,
      "completed",
    );
    assert.equal(
      (await db.query("SELECT issue FROM wishlist_metadata_attempts WHERE wishlist_item_id = 21 ORDER BY id DESC LIMIT 1")).rows[0].issue,
      "manual_rawg_selection",
    );
  });
});

function barrier() {
  let arrive, release;
  const ready = new Promise(resolve => { arrive = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  return { ready, release, hold: async () => { arrive(); await wait; } };
}

async function completeCatalog(db, id = 10) {
  await db.query(`UPDATE catalog_games SET metadata_quality='full',
    metadata_fetched_at=NOW(), cover_url='https://img.example/full.jpg',
    genres_json='["Action"]', metadata_failed_at=NULL WHERE id=$1`, [id]);
}

const noSearch = async () => { assert.fail("A saved RAWG identity must not be rematched"); };
const noIngestion = async () => { assert.fail("Unexpected RAWG detail request"); };

test("expired running work is reclaimed and a reused worker ID cannot finish its old attempt", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20 });
    const gate = barrier();
    const old = processNextWishlistMetadataBatch({ db, userId: 1, workerId: "same-worker",
      searchCatalogFn: noSearch,
      ingestRawgGameMetadataFn: async () => { await gate.hold(); throw new Error("old provider failed"); },
    });
    try {
      await gate.ready;
      assert.equal(await processNextWishlistMetadataBatch({ db, userId: 1, searchCatalogFn: noSearch, ingestRawgGameMetadataFn: noIngestion }), null);
      await db.query("UPDATE wishlist_metadata_work SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE wishlist_item_id=20");
      const recovered = await processNextWishlistMetadataBatch({ db, userId: 1, workerId: "same-worker",
        searchCatalogFn: noSearch, ingestRawgGameMetadataFn: async () => { await completeCatalog(db); },
      });
      assert.equal(recovered.status, "completed");
      const saved = (await db.query("SELECT * FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0];
      assert.equal(saved.attempt_count, 2);
      gate.release();
      assert.equal((await old).reason, "lease_lost");
      assert.deepEqual((await db.query("SELECT * FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0], saved);
    } finally { gate.release(); await old; }
  });
});

test("manual matching defeats late successful and failed workers without changing personal fields", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    await completeCatalog(db, 11);
    for (const fails of [false, true]) {
      await db.query("UPDATE user_wishlist_items SET catalog_game_id=10 WHERE id=20");
      await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20 });
      await db.query("UPDATE wishlist_metadata_work SET status='queued', next_attempt_at=NOW() WHERE wishlist_item_id=20");
      const gate = barrier();
      const old = processNextWishlistMetadataBatch({ db, userId: 1, wishlistItemId: 20,
        searchCatalogFn: noSearch, ingestRawgGameMetadataFn: async () => {
          await gate.hold();
          if (fails) throw new Error("old failure");
          await completeCatalog(db, 10);
        },
      });
      try {
        await gate.ready;
        await selectWishlistRawgMatch(1, 20, 101, { db, ingestRawgGameMetadata: async () => ({ catalogGame: { id: 11 } }) });
        const savedWork = (await db.query("SELECT * FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0];
        const savedItem = (await db.query("SELECT * FROM user_wishlist_items WHERE id=20")).rows[0];
        gate.release();
        assert.equal((await old).status, "skipped");
        assert.deepEqual((await db.query("SELECT * FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0], savedWork);
        assert.deepEqual((await db.query("SELECT * FROM user_wishlist_items WHERE id=20")).rows[0], savedItem);
      } finally { gate.release(); await old; }
      await db.query("UPDATE catalog_games SET metadata_fetched_at=NULL, metadata_quality='search_result' WHERE id=10");
    }
  });
});

test("catalog linking rolls back when saving queue completion fails", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    await completeCatalog(db, 11);
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 22 });
    await db.query(`CREATE FUNCTION reject_completed_work() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status='completed' THEN RAISE EXCEPTION 'fixture completion failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_completed_work BEFORE UPDATE ON wishlist_metadata_work
      FOR EACH ROW EXECUTE FUNCTION reject_completed_work()`);
    const result = await processNextWishlistMetadataBatch({ db, userId: 1,
      searchCatalogFn: async () => ({ results: [{ id: 11, rawg_id: 101, name: "Unique Match" }] }),
      ingestRawgGameMetadataFn: noIngestion,
    });
    assert.equal(result.status, "failed");
    assert.equal((await db.query("SELECT catalog_game_id FROM user_wishlist_items WHERE id=22")).rows[0].catalog_game_id, null);
    assert.equal((await db.query("SELECT status FROM wishlist_metadata_work WHERE wishlist_item_id=22")).rows[0].status, "failed");
  });
});

test("fresh catalog reuse retains its due date; due complete and incomplete snapshots fetch real detail", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    let fetches = 0;
    const ingestion = createMetadataIngestionService({ dbPool: db,
      fetchRawgDetail: async id => {
        fetches++;
        return { id, name: "Known Game", background_image: "https://img.example/current.jpg", genres: [{ name: "RPG" }], description: "Fresh detail" };
      },
    });
    await ingestion.ingestRawgGame(100);
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20 });
    const options = { db, userId: 1, wishlistItemId: 20, searchCatalogFn: noSearch, ingestRawgGameMetadataFn: ingestion.ingestRawgGame };
    assert.equal((await processNextWishlistMetadataBatch(options)).status, "completed");
    assert.equal(fetches, 1);
    const due = (await db.query("SELECT next_attempt_at FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0].next_attempt_at;
    await db.query("UPDATE wishlist_metadata_work SET next_attempt_at=NOW() WHERE wishlist_item_id=20");
    await processNextWishlistMetadataBatch(options);
    assert.equal(fetches, 1);
    assert.deepEqual((await db.query("SELECT next_attempt_at FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0].next_attempt_at, due);
    for (const incomplete of [false, true]) {
      await db.query(`UPDATE catalog_games SET metadata_fetched_at=NOW()-INTERVAL '200 days',
        genres_json=CASE WHEN $1 THEN '[]'::jsonb ELSE genres_json END WHERE id=10`, [incomplete]);
      await db.query("UPDATE wishlist_metadata_work SET next_attempt_at=NOW() WHERE wishlist_item_id=20");
      assert.equal((await processNextWishlistMetadataBatch(options)).status, "completed");
    }
    assert.equal(fetches, 3);
    await refreshWishlistMetadataItem(1, 20, options);
    assert.equal(fetches, 4, "Explicit refresh must fetch even fresh reusable metadata");
  });
});

test("the first incomplete retry fetches after three days instead of extending to a week", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    const fetched = new Date(Date.now() - 3 * 86400000 - 1000);
    await completeCatalog(db);
    await db.query("UPDATE catalog_games SET genres_json='[]', metadata_fetched_at=$1 WHERE id=10", [fetched]);
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20 });
    await db.query("UPDATE wishlist_metadata_work SET attempt_count=1, status='unmatched', identity_state='exact' WHERE wishlist_item_id=20");
    let calls = 0;
    const before = Date.now();
    await processNextWishlistMetadataBatch({ db, userId: 1, searchCatalogFn: noSearch,
      ingestRawgGameMetadataFn: async (id, options) => { assert.equal(options.force, true); calls++; },
    });
    assert.equal(calls, 1);
    const row = (await db.query("SELECT * FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0];
    assert.equal(row.status, "unmatched");
    assert.ok(row.next_attempt_at.getTime() >= before + 7 * 86400000);
  });
});

test("failure preserves exact identity and Retry-After; manual refresh honors shared provider backoff", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20 });
    const before = Date.now();
    const result = await processNextWishlistMetadataBatch({ db, userId: 1, searchCatalogFn: noSearch,
      ingestRawgGameMetadataFn: async () => { throw Object.assign(new Error("Unavailable"), { code: "rawg_rate_limited", retryAfterMs: 10 * 86400000 }); },
    });
    assert.equal(result.identityState, "exact");
    const failed = (await db.query("SELECT * FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0];
    assert.ok(failed.next_attempt_at.getTime() >= before + 10 * 86400000);
    assert.equal(await processNextWishlistMetadataBatch({ db, userId: 1, searchCatalogFn: noSearch, ingestRawgGameMetadataFn: noIngestion }), null);
    await assert.rejects(refreshWishlistMetadataItem(1, 20, { db, searchCatalogFn: noSearch, ingestRawgGameMetadataFn: noIngestion }), error => error.status === 409 && /retry is scheduled/.test(error.message));
    assert.deepEqual((await db.query("SELECT next_attempt_at FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0].next_attempt_at, failed.next_attempt_at);
    await db.query("UPDATE wishlist_metadata_work SET next_attempt_at=NOW()-INTERVAL '1 second' WHERE wishlist_item_id=20");
    await db.query("UPDATE catalog_games SET metadata_failed_at=NOW(), metadata_next_refresh_at=NOW()+INTERVAL '12 days', metadata_failure_reason='rawg_rate_limited' WHERE id=10");
    const refresh = await refreshWishlistMetadataItem(1, 20, { db, searchCatalogFn: noSearch, ingestRawgGameMetadataFn: noIngestion });
    assert.equal(refresh.drain.results[0].issue, "provider_backoff");
    assert.equal((await db.query("SELECT catalog_game_id FROM user_wishlist_items WHERE id=20")).rows[0].catalog_game_id, 10);
  });
});

test("non-owner manual selection makes no provider request and duplicate selection preserves both items", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    await assert.rejects(selectWishlistRawgMatch(1, 23, 102, { db, ingestRawgGameMetadata: noIngestion }), error => error.status === 404);
    await assert.rejects(selectWishlistRawgMatch(1, 21, 100, { db, ingestRawgGameMetadata: async () => ({ catalogGame: { id: 10 } }) }), error => error.status === 409);
    assert.equal((await db.query("SELECT catalog_game_id FROM user_wishlist_items WHERE id=21")).rows[0].catalog_game_id, null);
  });
});

test("manual RAWG selection preserves inactive local Steam price identity and personal history", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    await db.query(`
      UPDATE user_wishlist_items SET catalog_game_id = NULL WHERE id = 20;
      INSERT INTO statuses (status, rank) VALUES ('playing', 1)
      ON CONFLICT (status) DO NOTHING;
      INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
      VALUES (10, 'steam', '900', 'known-steam'), (11, 'steam', '901', 'unique-steam');
      INSERT INTO user_external_accounts (user_id, provider, provider_user_id)
      VALUES (1, 'steam', '76561198000000001');
      INSERT INTO games (id, user_id, catalog_game_id, name, status, started_at, finished_at)
      VALUES (30, 1, 10, 'Known Game', 'playing', '2026-01-02', NULL);
      INSERT INTO user_wishlist_items
        (id, user_id, game_id, catalog_game_id, display_name, local_intent_active)
      VALUES (30, 1, 30, 10, 'Known Game', TRUE);
      INSERT INTO steam_wishlist_items
        (user_id, account_id, wishlist_item_id, steam_app_id, is_active, removed_at)
      SELECT 1, id, 30, '900', FALSE, NOW()
        FROM user_external_accounts WHERE user_id = 1 AND provider = 'steam';
      INSERT INTO user_game_sources
        (user_id, game_id, catalog_game_id, provider, provider_app_id, source_status,
         playtime_minutes_forever, last_played_at, first_play_observed_at, last_synced_at)
      VALUES (1, 30, 10, 'steam', '900', 'owned', 240, '2026-02-01T00:00:00Z',
              '2026-01-03T00:00:00Z', NOW());
      INSERT INTO integration_sync_runs
        (id, user_id, provider, sync_kind, trigger_type, status)
      VALUES (300, 1, 'steam', 'library', 'manual', 'succeeded'),
             (301, 1, 'steam', 'wishlist_prices', 'manual', 'succeeded');
      INSERT INTO steam_activity_observations
        (user_id, sync_run_id, game_id, catalog_game_id, steam_app_id, game_name,
         playtime_minutes_forever, playtime_delta_minutes, observed_at)
      VALUES (1, 300, 30, 10, '900', 'Known Game', 240, 30, '2026-02-01T00:00:00Z');
      INSERT INTO user_activity_events
        (user_id, source, event_type, game_id, wishlist_item_id, external_id,
         sync_run_id, dedupe_key, payload_json)
      VALUES (1, 'steam_library', 'steam_started_playing', 30, 30, '900', 300,
              'rawg-price-separation', '{"minutes":30}');
      INSERT INTO steam_price_monitors
        (user_id, account_id, wishlist_item_id, steam_app_id, epoch)
      SELECT 1, id, 30, '900', '00000000-0000-0000-0000-000000000900'
        FROM user_external_accounts WHERE user_id = 1 AND provider = 'steam';
      INSERT INTO steam_price_observations
        (monitor_id, sync_run_id, epoch, observed_at, country, currency, offer_id,
         offer_name, availability, current_minor, regular_minor, discount_percent,
         sale, normalizer_version, evidence_json)
      SELECT id, 301, epoch, '2026-02-01T00:00:00Z', 'IL', 'ILS', 'offer-900',
             'Known Game', 'available', 1200, 1500, 20, TRUE, 1, '{}'
        FROM steam_price_monitors WHERE wishlist_item_id = 30;
      UPDATE steam_price_monitors monitor
         SET latest_observation_id = observation.id,
             comparison_observation_id = observation.id
        FROM steam_price_observations observation
       WHERE monitor.id = observation.monitor_id AND monitor.wishlist_item_id = 30;
    `);

    const before = (await db.query(`
      SELECT steam_app_id, reason FROM steam_price_targets WHERE wishlist_item_id = 30
    `)).rows;
    const beforeState = (await db.query(`
      SELECT w.catalog_game_id, w.game_id, w.local_intent_active, g.status,
             g.started_at, g.finished_at, source.provider_app_id,
             source.playtime_minutes_forever, source.last_played_at,
             source.first_play_observed_at, membership.steam_app_id,
             membership.is_active, event.event_type, event.payload_json,
             activity.playtime_minutes_forever AS observed_playtime,
             monitor.steam_app_id AS monitored_app_id, observation.current_minor
        FROM user_wishlist_items w
        JOIN games g ON g.id = w.game_id
        JOIN user_game_sources source ON source.game_id = g.id
        JOIN steam_wishlist_items membership ON membership.wishlist_item_id = w.id
        JOIN user_activity_events event ON event.wishlist_item_id = w.id
        JOIN steam_activity_observations activity ON activity.game_id = g.id
        JOIN steam_price_monitors monitor ON monitor.wishlist_item_id = w.id
        JOIN steam_price_observations observation ON observation.monitor_id = monitor.id
       WHERE w.id = 30
    `)).rows[0];

    await selectWishlistRawgMatch(1, 30, 101, {
      db,
      ingestRawgGameMetadata: async () => ({ catalogGame: { id: 11 } }),
    });

    assert.deepEqual((await db.query(`
      SELECT steam_app_id, reason FROM steam_price_targets WHERE wishlist_item_id = 30
    `)).rows, before);
    assert.deepEqual((await db.query(`
      SELECT w.catalog_game_id, w.game_id, w.local_intent_active, g.status,
             g.started_at, g.finished_at, source.provider_app_id,
             source.playtime_minutes_forever, source.last_played_at,
             source.first_play_observed_at, membership.steam_app_id,
             membership.is_active, event.event_type, event.payload_json,
             activity.playtime_minutes_forever AS observed_playtime,
             monitor.steam_app_id AS monitored_app_id, observation.current_minor
        FROM user_wishlist_items w
        JOIN games g ON g.id = w.game_id
        JOIN user_game_sources source ON source.game_id = g.id
        JOIN steam_wishlist_items membership ON membership.wishlist_item_id = w.id
        JOIN user_activity_events event ON event.wishlist_item_id = w.id
        JOIN steam_activity_observations activity ON activity.game_id = g.id
        JOIN steam_price_monitors monitor ON monitor.wishlist_item_id = w.id
        JOIN steam_price_observations observation ON observation.monitor_id = monitor.id
       WHERE w.id = 30
    `)).rows[0], { ...beforeState, catalog_game_id: 11 });
  });
});

test("an expired response is skipped without recording a successful batch item", async () => {
  await withMetadataSchema(async db => {
    await seed(db);
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20 });
    const result = await drainWishlistMetadataQueue({ db, userId: 1, maxItems: 1, searchCatalogFn: noSearch,
      ingestRawgGameMetadataFn: async () => {
        await db.query("UPDATE wishlist_metadata_work SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE wishlist_item_id=20");
      },
    });
    assert.deepEqual(result, { processed: 0, results: [] });
  });
});

test("a long provider request renews its current lease", { timeout: 15000 }, async t => {
  await withMetadataSchema(async db => {
    await seed(db);
    await enqueueWishlistMetadataWork(db, { userId: 1, wishlistItemId: 20 });
    const gate = barrier();
    let renewed;
    const heartbeat = new Promise(resolve => { renewed = resolve; });
    const observedDb = {
      connect: () => db.connect(),
      query: async (sql, values) => {
        const result = await db.query(sql, values);
        if (sql.includes("SET lease_expires_at = NOW()")) renewed(result.rowCount);
        return result;
      },
    };
    t.mock.timers.enable({ apis: ["setInterval"] });
    const worker = processNextWishlistMetadataBatch({ db: observedDb, userId: 1,
      searchCatalogFn: noSearch, ingestRawgGameMetadataFn: async () => {
        await gate.hold();
        await completeCatalog(db);
      },
    });
    try {
      await gate.ready;
      await db.query("UPDATE wishlist_metadata_work SET lease_expires_at=NOW()+INTERVAL '5 seconds' WHERE wishlist_item_id=20");
      t.mock.timers.tick(40000);
      assert.equal(await heartbeat, 1);
      const renewedWork = (await db.query("SELECT lease_expires_at FROM wishlist_metadata_work WHERE wishlist_item_id=20")).rows[0];
      assert.ok(renewedWork.lease_expires_at.getTime() > Date.now() + 100000);
      gate.release();
      assert.equal((await worker).status, "completed");
    } finally {
      gate.release();
      await worker;
      t.mock.timers.reset();
    }
  });
});
