import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dropDisposableDatabase } from './testDatabase.js';
import { workerClock } from './testWorkerClock.js';
dotenv.config();

test('Steam scheduler: committed enqueue, cross-process recovery and expiry', { timeout: 60000 }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  const database = `steam_scheduler_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: url.href });
  const keys = ['DATABASE_URL', 'PGSSL', 'NODE_ENV', 'STEAM_MOCK_OWNED_GAMES_JSON', 'STEAM_MOCK_PLAYER_SUMMARY_JSON'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  let pool, sync, stop;
  await admin.connect(); await admin.query(`CREATE DATABASE ${database}`);
  url.pathname = `/${database}`;
  try {
    await promisify(execFile)(process.execPath, ['scripts/db-migrate.js'], {
      env: { ...process.env, DATABASE_URL: url.href, PGSSL: 'false' },
    });
    Object.assign(process.env, { DATABASE_URL: url.href, PGSSL: 'false', NODE_ENV: 'test',
      STEAM_MOCK_OWNED_GAMES_JSON: JSON.stringify({ response: { game_count: 1,
        games: [{ appid: 999999, name: 'Scheduler Soundtrack', playtime_forever: 0 }] } }),
      STEAM_MOCK_PLAYER_SUMMARY_JSON: JSON.stringify({ response: { players: [] } }),
    });
    globalThis.fetch = async () => assert.fail('Unexpected real provider call');
    ({ pool } = await import('./db.js'));
    sync = await import('./services/steamLibrarySyncService.js');
    const query = pool.query.bind(pool);
    let onClaim = null;
    t.mock.method(pool, 'query', async (sql, values) => {
      const result = await query(sql, values);
      if (sql.includes('WITH candidate AS')) await onClaim?.(result);
      return result;
    });
    let sequence = 0;
    const owner = async () => {
      const userId = (await query("INSERT INTO users (username, password_hash) VALUES ($1, 'fixture') RETURNING id", [`scheduler_${++sequence}`])).rows[0].id;
      const providerId = `7656119${String(userId).padStart(10, '0')}`;
      const accountId = (await query("INSERT INTO user_external_accounts (user_id, provider, provider_user_id) VALUES ($1, 'steam', $2) RETURNING id", [userId, providerId])).rows[0].id;
      return { userId, accountId, providerId };
    };
    const insertRemote = async user => {
      const id = crypto.randomUUID();
      await query(`INSERT INTO steam_sync_jobs (id, user_id, account_id, provider_user_id)
        VALUES ($1, $2, $3, $4)`, [id, user.userId, user.accountId, user.providerId]);
      return id;
    };

    await t.test('local enqueue during a final empty claim is processed before that drain exits', async () => {
      const user = await owner(), clock = workerClock();
      let ready, release;
      const entered = new Promise(resolve => { ready = resolve; });
      const hold = new Promise(resolve => { release = resolve; });
      onClaim = async result => {
        if (!result.rows.length) { onClaim = null; ready(); await hold; }
      };
      stop = sync.startSteamSyncJobScheduler({ timers: clock.timers });
      const running = clock.next();
      try {
        await entered;
        const job = await sync.enqueueSteamSync(user.userId);
        assert.equal((await query('SELECT status FROM steam_sync_jobs WHERE id = $1', [job.id])).rows[0].status, 'queued');
        assert.equal(clock.size, 0, 'wake during drain must not overlap it');
        release(); await running;
        assert.equal((await sync.getSteamSyncJob(user.userId, job.id)).status, 'completed');
        assert.equal(await sync.getSteamSyncJob(user.userId + 1000, job.id), null);
        assert.equal(Number((await query('SELECT COUNT(*) FROM integration_sync_runs WHERE user_id = $1', [user.userId])).rows[0].count), 1);
        assert.equal(clock.nextDelay, 0, 'coalesced scheduler wake remains scheduled');
      } finally { release(); await running; stop(); onClaim = null; }
      assert.equal(clock.size, 0);
    });

    await t.test('idle scheduler wakes promptly for a committed local enqueue', async () => {
      const user = await owner(), clock = workerClock();
      stop = sync.startSteamSyncJobScheduler({ timers: clock.timers });
      try {
        for (let i = 0; i < 4; i++) await clock.next();
        assert.equal(clock.nextDelay, 60000);
        const job = await sync.enqueueSteamSync(user.userId);
        assert.equal(clock.nextDelay, 0);
        await clock.next();
        assert.equal((await sync.getSteamSyncJob(user.userId, job.id)).status, 'completed');
        assert.equal(clock.nextDelay, 15000, 'work resets idle backoff');
      } finally { stop(); }
    });

    await t.test('capped polling finds remote enqueues and reclaims only expired locks', async () => {
      const user = await owner(), clock = workerClock();
      stop = sync.startSteamSyncJobScheduler({ timers: clock.timers });
      try {
        for (let i = 0; i < 4; i++) await clock.next();
        const id = await insertRemote(user); // No enqueue function or wake hint.
        assert.equal(clock.nextDelay, 60000);
        await clock.next();
        assert.equal((await sync.getSteamSyncJob(user.userId, id)).status, 'completed');
        const recoveryUser = await owner();
        const recoveryId = await insertRemote(recoveryUser);
        const oldLease = crypto.randomUUID();
        await query("UPDATE steam_sync_jobs SET status = 'running', lease_token = $2, locked_at = NOW() WHERE id = $1", [recoveryId, oldLease]);
        await clock.next();
        assert.equal((await query('SELECT lease_token FROM steam_sync_jobs WHERE id = $1', [recoveryId])).rows[0].lease_token, oldLease);
        await query("UPDATE steam_sync_jobs SET locked_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [recoveryId]);
        await clock.next();
        assert.equal((await sync.getSteamSyncJob(recoveryUser.userId, recoveryId)).status, 'completed');
        assert.equal((await query('SELECT lease_token FROM steam_sync_jobs WHERE id = $1', [recoveryId])).rows[0].lease_token, null);
      } finally { stop(); }
    });
  } finally {
    stop?.();
    t.mock.restoreAll();
    await sync?.drainSteamSyncJobs();
    await pool?.end();
    globalThis.fetch = nativeFetch;
    await dropDisposableDatabase(admin, database); await admin.end();
    for (const [key, value] of Object.entries(saved)) {
      if (value == null) delete process.env[key]; else process.env[key] = value;
    }
  }
});
