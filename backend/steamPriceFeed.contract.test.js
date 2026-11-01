import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { dropDisposableDatabase } from './testDatabase.js';

dotenv.config();

test('Steam price feed: bounded bulk persistence and atomic cursor', { timeout: 60000 }, async t => {
  const source = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname), 'disposable tests require localhost');
  const database = `price_feed_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: source.href });
  const savedEnv = { DATABASE_URL: process.env.DATABASE_URL, PGSSL: process.env.PGSSL,
    NODE_ENV: process.env.NODE_ENV, STEAM_WEB_API_KEY: process.env.STEAM_WEB_API_KEY };
  const nativeFetch = globalThis.fetch;
  let pool;
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  try {
    source.pathname = `/${database}`;
    Object.assign(process.env, { DATABASE_URL: source.href, PGSSL: 'false', NODE_ENV: 'test', STEAM_WEB_API_KEY: 'fixture-key' });
    ({ pool } = await import('./db.js'));
    // Only the existing, unchanged global-feed tables are needed. No application
    // schema/migration change or ordinary development data is involved.
    await pool.query(await readFile('backend/migrations/037_add_steam_price_change_feed.sql', 'utf8'));
    await pool.query('CREATE TABLE legacy_feed_changes (LIKE steam_price_feed_changes INCLUDING ALL)');
    const { ensureSteamPriceFeed, STEAM_PRICE_FEED_WRITE_BATCH_SIZE: batchSize } = await import('./services/steamPriceFeedService.js');
    let apps = [], providerCalls = 0, onFetch = null, beforeQuery = null;
    let queries = [];
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      assert.equal(url.hostname, 'partner.steam-api.com');
      assert.ok(url.pathname.includes('GetAppList'));
      assert.equal(url.searchParams.get('key'), 'fixture-key');
      providerCalls++;
      await onFetch?.();
      return Response.json({ response: { apps, have_more_results: false } }, { headers: { 'x-eresult': '1' } });
    };
    // Observe transaction statements while preserving pg.Pool's callback-based
    // connect path used by pool.query. Failure hooks still execute real SQL.
    const connect = pool.connect.bind(pool);
    t.mock.method(pool, 'connect', function (...args) {
      if (args.length) return connect(...args);
      return connect().then(client => ({
        async query(sql, values) {
          queries.push({ sql, values });
          await beforeQuery?.(sql, values, client);
          return client.query(sql, values);
        },
        release: () => client.release(),
      }));
    });
    const reset = async () => {
      beforeQuery = null; onFetch = null; queries = []; providerCalls = 0; apps = [];
      await pool.query('TRUNCATE steam_price_feed_changes, legacy_feed_changes');
      await pool.query(`UPDATE steam_price_feed_cursor SET cursor_modified_since = 123,
        last_success_at = NULL, lease_token = NULL, lease_expires_at = NULL,
        last_error_code = NULL, last_error_at = NULL WHERE id = 1`);
    };
    const cursor = async () => (await pool.query('SELECT * FROM steam_price_feed_cursor WHERE id = 1')).rows[0];
    const rows = async (table = 'steam_price_feed_changes') => (await pool.query(`SELECT * FROM ${table} ORDER BY app_id`)).rows;
    const writes = () => queries.filter(q => q.sql.startsWith('INSERT INTO steam_price_feed_changes'));

    for (const count of [0, 1, batchSize, batchSize + 1, batchSize * 2 + 1]) {
      await t.test(`bootstrap of ${count} records uses bounded chunks and preserves every app`, async () => {
        await reset();
        apps = Array.from({ length: count }, (_, index) => ({ appid: index + 1, last_modified: 100, price_change_number: '1' }));
        const result = await ensureSteamPriceFeed();
        assert.equal(result.mode, 'delta');
        assert.equal(result.changedAppIds.length, count);
        assert.equal((await rows()).length, count);
        assert.equal(writes().length, Math.ceil(count / batchSize));
        for (const query of writes()) {
          assert.ok(query.values.length <= batchSize * 4);
          assert.ok(query.sql.length < 150000, 'statement text stays bounded');
        }
        const lookups = queries.filter(q => q.sql.startsWith('SELECT app_id, price_change_number'));
        assert.equal(lookups.length, Math.ceil(count / batchSize));
        assert.ok(lookups.every(q => q.values[0].length <= batchSize));
        assert.equal(providerCalls, 1);
        const saved = await cursor();
        assert.ok(saved.last_success_at);
        assert.ok(Number(saved.cursor_modified_since) > 123);
        assert.equal(saved.lease_token, null);
        assert.ok(queries.some(q => q.sql.endsWith('FOR UPDATE')));
      });
    }

    await t.test('bulk results match old SQL for unchanged/changed/null/older records and retention', async () => {
      await reset();
      await pool.query(`INSERT INTO steam_price_feed_changes
        (app_id, last_modified, price_change_number, last_seen_at, price_candidate_at)
        SELECT id::text, 100, CASE WHEN id = 4 THEN NULL ELSE '2' END,
          NOW() - INTERVAL '1 day', CASE WHEN id = 10 THEN NULL ELSE '2000-01-01'::timestamptz END
        FROM unnest(ARRAY[1,2,3,4,5,6,7,10]) id`);
      await pool.query(`INSERT INTO steam_price_feed_changes VALUES ('90', 1, '1', '2000-01-01', '2000-01-01')`);
      await pool.query('INSERT INTO legacy_feed_changes SELECT * FROM steam_price_feed_changes');
      apps = [
        { appid: 1, last_modified: 101, price_change_number: '2' },
        { appid: 2, last_modified: 101, price_change_number: '3' },
        { appid: 3, last_modified: 101, price_change_number: null },
        { appid: 4, last_modified: 101, price_change_number: '7' },
        { appid: 5, last_modified: 90, price_change_number: '9' },
        { appid: 6, last_modified: 90, price_change_number: '2' },
        { appid: 7, last_modified: 100, price_change_number: '3' },
        { appid: 8, last_modified: 101, price_change_number: '1' },
        { appid: 9, last_modified: 101, price_change_number: null },
        { appid: 10, last_modified: 100, price_change_number: '2' },
      ];
      // Reference is the previous row-by-row query, including its candidate rule.
      const prior = new Map((await rows('legacy_feed_changes')).map(row => [row.app_id, row.price_change_number]));
      for (const app of apps) {
        const candidate = !prior.has(String(app.appid)) || app.price_change_number == null || prior.get(String(app.appid)) !== app.price_change_number;
        await pool.query(`INSERT INTO legacy_feed_changes (app_id, last_modified, price_change_number, last_seen_at, price_candidate_at)
          VALUES ($1, $2, $3, NOW(), CASE WHEN $4::boolean THEN NOW() END)
          ON CONFLICT (app_id) DO UPDATE SET
            last_modified = GREATEST(legacy_feed_changes.last_modified, EXCLUDED.last_modified),
            price_change_number = CASE WHEN EXCLUDED.last_modified >= legacy_feed_changes.last_modified
              THEN EXCLUDED.price_change_number ELSE legacy_feed_changes.price_change_number END,
            last_seen_at = NOW(),
            price_candidate_at = CASE WHEN $4::boolean THEN NOW() ELSE legacy_feed_changes.price_candidate_at END`,
        [String(app.appid), app.last_modified, app.price_change_number, candidate]);
      }
      await pool.query("DELETE FROM legacy_feed_changes WHERE last_seen_at < NOW() - INTERVAL '14 days'");
      const result = await ensureSteamPriceFeed();
      assert.deepEqual(result.changedAppIds, ['2', '3', '4', '5', '7', '8', '9']);
      const actual = await rows();
      const normalize = records => records.map(row => ({ ...row,
        last_seen_at: row.last_seen_at.getFullYear() > 2020 ? 'refreshed' : row.last_seen_at.toISOString(),
        price_candidate_at: row.price_candidate_at == null ? null : row.price_candidate_at.getFullYear() > 2020 ? 'refreshed' : row.price_candidate_at.toISOString(),
      }));
      assert.deepEqual(normalize(actual), normalize(await rows('legacy_feed_changes')));
      assert.equal(new Set(actual.map(row => row.last_seen_at.getTime())).size, 1, 'all batches share transaction time');
      assert.equal(actual.find(row => row.app_id === '5').price_change_number, '2', 'older records cannot overwrite newer numbers');
      const before = providerCalls;
      const reused = await ensureSteamPriceFeed();
      assert.equal(providerCalls, before, 'later accounts reuse the shared fresh feed');
      assert.deepEqual(reused.changedAppIds, ['2', '3', '4', '5', '7', '8', '9']);
    });

    await t.test('a later failed batch rolls back prior batches without advancing cursor', async () => {
      await reset();
      await pool.query("INSERT INTO steam_price_feed_changes VALUES ('99999', 1, '1', '2000-01-01', '2000-01-01')");
      const before = await rows();
      apps = Array.from({ length: batchSize + 1 }, (_, index) => ({ appid: index + 1, last_modified: 100, price_change_number: '1' }));
      let batches = 0;
      beforeQuery = async sql => {
        if (sql.startsWith('INSERT INTO steam_price_feed_changes') && ++batches === 2) {
          throw Object.assign(new Error('injected second-batch failure'), { code: 'fixture_batch_failure' });
        }
      };
      const result = await ensureSteamPriceFeed();
      assert.equal(result.feedErrorCode, 'fixture_batch_failure');
      assert.deepEqual(await rows(), before);
      const saved = await cursor();
      assert.equal(Number(saved.cursor_modified_since), 123);
      assert.equal(saved.last_success_at, null);
      assert.equal(saved.lease_token, null);
      assert.ok(queries.some(q => q.sql === 'ROLLBACK'));
    });

    await t.test('lease replacement during fetch fences out writes and preserves replacement lease', async () => {
      await reset();
      const replacement = crypto.randomUUID();
      apps = [{ appid: 1, last_modified: 100, price_change_number: '1' }];
      onFetch = () => pool.query('UPDATE steam_price_feed_cursor SET lease_token = $1 WHERE id = 1', [replacement]);
      const result = await ensureSteamPriceFeed();
      assert.equal(result.feedErrorCode, 'steam_price_feed_lease_lost');
      assert.equal(writes().length, 0);
      assert.deepEqual(await rows(), []);
      const saved = await cursor();
      assert.equal(saved.lease_token, replacement);
      assert.equal(Number(saved.cursor_modified_since), 123);
    });

    await t.test('cursor lock prevents a competing writer from replacing the persistence lease', async () => {
      await reset();
      apps = [{ appid: 1, last_modified: 100, price_change_number: '1' }];
      beforeQuery = async sql => {
        if (!sql.startsWith('INSERT INTO steam_price_feed_changes')) return;
        const competitor = new pg.Client({ connectionString: source.href });
        await competitor.connect();
        try {
          await competitor.query("SET lock_timeout = '100ms'");
          await assert.rejects(competitor.query('UPDATE steam_price_feed_cursor SET lease_token = $1 WHERE id = 1', [crypto.randomUUID()]), error => error.code === '55P03');
        } finally { await competitor.end(); }
      };
      assert.equal((await ensureSteamPriceFeed()).mode, 'delta');
    });

    await t.test('failed final cursor fencing rolls back writes and retention deletion', async () => {
      await reset();
      await pool.query("INSERT INTO steam_price_feed_changes VALUES ('99999', 1, '1', '2000-01-01', '2000-01-01')");
      const before = await rows();
      apps = [{ appid: 1, last_modified: 100, price_change_number: '1' }];
      beforeQuery = async (sql, values, client) => {
        if (sql.includes('SET cursor_modified_since = $2')) {
          // Defensive CAS failure despite the row lock: simulate an ownership
          // change inside this transaction and prove no feed writes commit.
          await client.query('UPDATE steam_price_feed_cursor SET lease_token = $1 WHERE id = 1', [crypto.randomUUID()]);
        }
      };
      assert.equal((await ensureSteamPriceFeed()).feedErrorCode, 'steam_price_feed_lease_lost');
      assert.deepEqual(await rows(), before);
      assert.equal(Number((await cursor()).cursor_modified_since), 123);
      assert.equal((await cursor()).last_success_at, null);
      assert.ok(queries.some(q => q.sql === 'ROLLBACK'));
    });
  } finally {
    t.mock.restoreAll();
    globalThis.fetch = nativeFetch;
    await pool?.end();
    await dropDisposableDatabase(admin, database);
    await admin.end();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value == null) delete process.env[key]; else process.env[key] = value;
    }
  }
});
