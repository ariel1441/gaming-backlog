import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
dotenv.config();
const exec = promisify(execFile);

test('release review regressions use an isolated database and no providers', { timeout: 120000 }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.href, ssl: false });
  const database = `review_fixes_${crypto.randomUUID().replaceAll('-', '')}`;
  let pool;
  const originalFetch = globalThis.fetch;
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  try {
    url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = 'test';
    process.env.PGSSL = 'false';
    globalThis.fetch = async () => { throw new Error('Provider requests forbidden in review regression tests'); };
    await exec(process.execPath, ['scripts/db-migrate.js'], { env: process.env });
    ({ pool } = await import('./db.js'));
    await pool.query("INSERT INTO statuses(status,rank) VALUES('wishlist',99) ON CONFLICT DO NOTHING");
    const steam = await import('./services/steamService.js');
    const wishlist = await import('./services/steamWishlistService.js');
    const activity = await import('./services/activityEventService.js');
    const userId = (await pool.query("INSERT INTO users(username,password_hash) VALUES('review_owner','x') RETURNING id")).rows[0].id;
    const account = await steam.upsertSteamAccount(userId, '76561198000000001');
    const run = (await pool.query("INSERT INTO integration_sync_runs(user_id,provider,sync_kind,trigger_type,status) VALUES($1,'steam','library','manual','succeeded') RETURNING id", [userId])).rows[0].id;
    await pool.query("INSERT INTO steam_sync_jobs(id,user_id,account_id,provider_user_id,sync_run_id,status) VALUES($1,$2,$3,$4,$5,'completed')", [crypto.randomUUID(), userId, account.id, account.provider_user_id, run]);

    await t.test('current suggestion succeeds, replay and subsequent status changes are rejected', async () => {
      const gameId = (await pool.query("INSERT INTO games(user_id,name,status,started_at,finished_at) VALUES($1,'Status fixture','plan to play','2026-01-01','2026-01-02') RETURNING id", [userId])).rows[0].id;
      await pool.query("INSERT INTO user_game_sources(user_id,game_id,provider,provider_app_id,source_status,last_synced_at) VALUES($1,$2,'steam','10','owned',NOW())", [userId, gameId]);
      const event = await activity.createOpenActivityEvent({ userId, source: 'steam_library', eventType: 'steam_status_suggestion', gameId, externalId: '10', syncRunId: run, dedupeKey: 'status', payload: { currentStatus: 'plan to play' } });
      await pool.query("UPDATE games SET status='finished' WHERE id=$1", [gameId]);
      await assert.rejects(steam.applySteamStatusSuggestion(userId, gameId, { activityEventId: event.id }), /no longer current/);
      assert.equal((await pool.query('SELECT status FROM games WHERE id=$1', [gameId])).rows[0].status, 'finished');
      await pool.query("UPDATE games SET status='plan to play' WHERE id=$1", [gameId]);
      const result = await steam.applySteamStatusSuggestion(userId, gameId, { activityEventId: event.id, setStartedAt: false });
      assert.equal(result.game.status, 'playing');
      assert.equal(result.activityEventResolved, true);
      assert.deepEqual((await pool.query('SELECT started_at,finished_at FROM games WHERE id=$1', [gameId])).rows[0], { started_at: '2026-01-01', finished_at: '2026-01-02' });
      await assert.rejects(steam.applySteamStatusSuggestion(userId, gameId, { activityEventId: event.id }), /no longer current/);
    });

    await t.test('legacy Wishlist must enter Backlog before explicit retirement', async () => {
      const gameId = (await pool.query("INSERT INTO games(user_id,name,status) VALUES($1,'Legacy wishlist fixture','wishlist') RETURNING id", [userId])).rows[0].id;
      const itemId = (await pool.query("INSERT INTO user_wishlist_items(user_id,game_id,display_name,local_intent_active) VALUES($1,$2,'Legacy wishlist fixture',TRUE) RETURNING id", [userId, gameId])).rows[0].id;
      await pool.query("INSERT INTO steam_wishlist_items(user_id,account_id,wishlist_item_id,steam_app_id,is_active) VALUES($1,$2,$3,'30',FALSE)", [userId, account.id, itemId]);
      await pool.query("INSERT INTO user_game_sources(user_id,game_id,provider,provider_app_id,source_status,last_synced_at) VALUES($1,$2,'steam','30','owned',NOW())", [userId, gameId]);
      await assert.rejects(wishlist.retireOwnedWishlistIntention(userId, itemId, gameId), /before removing/);
      assert.equal((await pool.query('SELECT local_intent_active FROM user_wishlist_items WHERE id=$1', [itemId])).rows[0].local_intent_active, true);
      const moved = await wishlist.moveWishlistItemToBacklog(userId, itemId, 'playing');
      assert.equal(moved.gameId, gameId);
      await wishlist.retireOwnedWishlistIntention(userId, itemId, gameId);
      await wishlist.retireOwnedWishlistIntention(userId, itemId, gameId);
      assert.equal((await pool.query('SELECT status FROM games WHERE id=$1', [gameId])).rows[0].status, 'playing');
      assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM games WHERE user_id=$1 AND name='Legacy wishlist fixture'", [userId])).rows[0].count, 1);
    });

    await t.test('multiple Steam identities produce one item and one unresolved price target across pages', async () => {
      const itemId = (await pool.query("INSERT INTO user_wishlist_items(user_id,display_name,local_intent_active) VALUES($1,'Two editions',TRUE) RETURNING id", [userId])).rows[0].id;
      await pool.query("INSERT INTO steam_wishlist_items(user_id,account_id,wishlist_item_id,steam_app_id,provider_order,is_active) VALUES($1,$2,$3,'20',0,FALSE),($1,$2,$3,'21',1,TRUE)", [userId, account.id, itemId]);
      await pool.query("INSERT INTO user_wishlist_items(user_id,display_name,local_intent_active) VALUES($1,'Local only',TRUE)", [userId]);
      const page = await wishlist.listWishlistItems(userId, { limit: 1 });
      const next = await wishlist.listWishlistItems(userId, { limit: 1, offset: 1 });
      assert.equal(page.total, 2);
      assert.equal(next.total, 2);
      assert.notEqual(page.items[0].id, next.items[0].id);
      const multi = [...page.items, ...next.items].find(item => item.id === Number(itemId));
      assert.equal(multi.steamAppId, '21');
      assert.equal(multi.steamActive, true);
      const targets = (await pool.query('SELECT reason FROM steam_price_targets WHERE wishlist_item_id=$1', [itemId])).rows;
      assert.deepEqual(targets, [{ reason: 'identity_unresolved' }]);
      const migration = await readFile('backend/migrations/035_deduplicate_steam_price_targets.sql', 'utf8');
      await pool.query(migration);
      assert.ok((await readFile('backend/schema.sql', 'utf8')).replace(/\r\n/g, '\n').endsWith(migration.replace(/\r\n/g, '\n')));
    });

    await t.test('exact app lookup finds a linked candidate beyond fifty substring matches', async () => {
      const gameId = (await pool.query("INSERT INTO games(user_id,name,status) VALUES($1,'Exact game','wishlist') RETURNING id", [userId])).rows[0].id;
      for (let i = 0; i < 55; i++) {
        const appId = i === 54 ? '40' : `40${100 + i}`;
        await pool.query("INSERT INTO user_game_sources(user_id,game_id,provider,provider_app_id,source_status,last_synced_at) VALUES($1,$2,'steam',$3,'owned',NOW())", [userId, i === 54 ? gameId : null, appId]);
        await pool.query("INSERT INTO steam_import_candidates(user_id,steam_app_id,steam_name) VALUES($1,$2,$3)", [userId, appId, i === 54 ? 'ZZ Exact' : `AAA ${i}`]);
      }
      assert.equal((await steam.listSteamLinkCandidates(userId, { query: '40', limit: 50 })).results.some(c => c.steamAppId === '40'), false);
      const result = await steam.listSteamLinkCandidates(userId, { appId: '40', limit: 1 });
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].steamAppId, '40');
      assert.equal(result.results[0].linkedGameStatus, 'wishlist');
    });

    await t.test('old account suggestion cannot act after replacement and reobservation', async () => {
      const gameId = (await pool.query("INSERT INTO games(user_id,name,status) VALUES($1,'Account fixture','plan to play') RETURNING id", [userId])).rows[0].id;
      await pool.query("INSERT INTO user_game_sources(user_id,game_id,provider,provider_app_id,source_status,last_synced_at) VALUES($1,$2,'steam','50','owned',NOW())", [userId, gameId]);
      const event = await activity.createOpenActivityEvent({ userId, source: 'steam_library', eventType: 'steam_status_suggestion', gameId, externalId: '50', syncRunId: run, dedupeKey: 'account', payload: { currentStatus: 'plan to play' } });
      await steam.upsertSteamAccount(userId, '76561198000000002');
      await pool.query("UPDATE user_game_sources SET source_status='owned',game_id=$2,last_synced_at=NOW() WHERE user_id=$1 AND provider_app_id='50'", [userId, gameId]);
      await assert.rejects(steam.applySteamStatusSuggestion(userId, gameId, { activityEventId: event.id }), /no longer current/);
      assert.equal((await pool.query('SELECT status FROM games WHERE id=$1', [gameId])).rows[0].status, 'plan to play');
    });

    await t.test('migration runner rejects over-limit legacy backfill without losing its original CSV', async () => {
      const names = Array.from({ length: 11 }, (_, i) => `Genre ${i}`).join(', ');
      const gameId = (await pool.query("INSERT INTO games(user_id,name,status,my_genre) VALUES($1,'Genre fixture','plan to play',$2) RETURNING id", [userId, names])).rows[0].id;
      // Simulate an upgrade whose 025 backfill has not yet been recorded.
      await pool.query("DELETE FROM schema_migrations WHERE filename='025_add_personal_genres.sql'");
      await assert.rejects(exec(process.execPath, ['scripts/db-migrate.js'], { env: process.env }), error => /more than 10 distinct legacy genres/.test(error.stderr));
      assert.equal((await pool.query('SELECT my_genre FROM games WHERE id=$1', [gameId])).rows[0].my_genre, names);
      assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM schema_migrations WHERE filename='025_add_personal_genres.sql'")).rows[0].count, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await pool?.end();
    await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
});
