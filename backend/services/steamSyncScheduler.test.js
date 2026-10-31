import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db.js';
import { workerClock } from '../testWorkerClock.js';
import { runSteamSyncJobs, startSteamSyncJobScheduler } from './steamLibrarySyncService.js';

test('Steam scheduler backs off empty claims to 62 checks in one idle hour', async t => {
  let claims = 0;
  t.mock.method(pool, 'query', async sql => {
    assert.ok(sql.includes('WITH candidate AS'));
    claims++;
    return { rows: [] };
  });
  const clock = workerClock();
  const stop = startSteamSyncJobScheduler({ timers: clock.timers });
  try {
    await clock.advanceTo(3600000);
    assert.equal(claims, 62, 'fixed startup/15-second polling would make 241 claims');
    assert.equal(clock.size, 1);
  } finally { stop(); }
  assert.equal(clock.size, 0);
});

test('Steam shared drain rechecks a request received during its final empty claim', async t => {
  let claims = 0, release, ready;
  const entered = new Promise(resolve => { ready = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  t.mock.method(pool, 'query', async sql => {
    assert.ok(sql.includes('WITH candidate AS'));
    if (++claims === 1) { ready(); await hold; }
    return { rows: [] };
  });
  const first = runSteamSyncJobs();
  try {
    await entered;
    const joined = runSteamSyncJobs();
    assert.equal(first, joined, 'callers share the same active promise');
    assert.equal(claims, 1);
    release();
    assert.equal(await joined, 0);
    assert.equal(claims, 2, 'a final empty snapshot must be rechecked');
    assert.equal(await runSteamSyncJobs(), 0);
    assert.equal(claims, 3, 'a finished promise cannot swallow a later request');
  } finally { release(); await first; }
});

test('Steam scheduler query errors back off and the shared drain can retry', async t => {
  let attempts = 0, logged = 0;
  t.mock.method(pool, 'query', async () => {
    if (++attempts <= 2) throw Error('injected database failure');
    return { rows: [] };
  });
  t.mock.method(console, 'error', () => { logged++; });
  const clock = workerClock();
  const stop = startSteamSyncJobScheduler({ timers: clock.timers });
  try {
    await clock.next();
    assert.equal(clock.nextDelay, 15000);
    await clock.next();
    assert.equal(clock.nextDelay, 30000);
    await clock.next();
    assert.equal(clock.nextDelay, 60000);
    assert.equal(attempts, 3);
    assert.equal(logged, 2);
  } finally { stop(); }
});

test('Steam scheduler stop during a shared drain lets it finish without rearming', async t => {
  let ready, release, claims = 0;
  const entered = new Promise(resolve => { ready = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  t.mock.method(pool, 'query', async () => {
    if (++claims === 1) { ready(); await hold; }
    return { rows: [] };
  });
  const clock = workerClock();
  const stop = startSteamSyncJobScheduler({ timers: clock.timers });
  const running = clock.next();
  try {
    await entered;
    const joined = runSteamSyncJobs();
    stop(); stop();
    release(); await joined; await running;
    assert.equal(claims, 2);
    assert.equal(clock.size, 0);
  } finally { stop(); release(); await running; }
});
