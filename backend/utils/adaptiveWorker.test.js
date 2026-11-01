import test from 'node:test';
import assert from 'node:assert/strict';
import { startAdaptiveWorker } from './adaptiveWorker.js';
import { workerClock } from '../testWorkerClock.js';

test('idle polls back off exponentially to the cap and still find remote work', async () => {
  const clock = workerClock();
  let calls = 0, remoteWork = false;
  const worker = startAdaptiveWorker({ intervalMs: 5000, timers: clock.timers,
    run: async () => { calls++; return remoteWork; } });
  try {
    await clock.next();
    for (const delay of [5000, 10000, 20000, 40000, 60000, 60000]) {
      assert.equal(clock.nextDelay, delay);
      await clock.next();
    }
    remoteWork = true; // No local wake: recovery relies on capped polling.
    await clock.next();
    assert.equal(clock.nextDelay, 5000);
    assert.equal(calls, 8);
  } finally { worker.stop(); }
  assert.equal(clock.size, 0);
});

test('one idle hour needs 63 checks rather than 721 fixed five-second checks', async () => {
  const clock = workerClock();
  let calls = 0;
  const worker = startAdaptiveWorker({ intervalMs: 5000, timers: clock.timers, run: async () => { calls++; return false; } });
  await clock.advanceTo(3600000);
  worker.stop();
  assert.equal(calls, 63);
});

test('local wake interrupts a capped wait and repeated hints coalesce', async () => {
  const clock = workerClock();
  let calls = 0;
  const worker = startAdaptiveWorker({ intervalMs: 5000, timers: clock.timers, run: async () => { calls++; return false; } });
  try {
    for (let i = 0; i < 6; i++) await clock.next();
    assert.equal(clock.nextDelay, 60000);
    worker.wake(); worker.wake(); worker.wake();
    assert.equal(clock.size, 1);
    assert.equal(clock.nextDelay, 0);
    await clock.next();
    assert.equal(calls, 7);
    assert.equal(clock.nextDelay, 5000);
  } finally { worker.stop(); }
});

test('wake during an in-flight empty claim is retained without a concurrent drain', async () => {
  const clock = workerClock();
  let release, calls = 0, active = 0, peak = 0;
  const worker = startAdaptiveWorker({ intervalMs: 5000, timers: clock.timers, run: async () => {
    calls++; active++; peak = Math.max(peak, active);
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    active--;
    return false;
  } });
  const running = clock.next();
  worker.wake(); worker.wake();
  assert.equal(clock.size, 0);
  assert.equal(calls, 1);
  release(); await running;
  assert.equal(clock.nextDelay, 0);
  await clock.next();
  assert.equal(calls, 2);
  assert.equal(peak, 1);
  worker.stop();
});

test('active work resets idle backoff and retains normal batch cadence', async () => {
  const clock = workerClock();
  let worked = false;
  const worker = startAdaptiveWorker({ intervalMs: 5000, timers: clock.timers, run: async () => worked });
  try {
    for (let i = 0; i < 6; i++) await clock.next();
    worked = true;
    await clock.next();
    assert.equal(clock.nextDelay, 5000);
    await clock.next();
    assert.equal(clock.nextDelay, 5000);
    worked = false;
    await clock.next();
    assert.equal(clock.nextDelay, 5000);
  } finally { worker.stop(); }
});

test('errors back off, remain retryable and cannot strand the worker if logging fails', async () => {
  const clock = workerClock();
  let attempts = 0, errors = 0;
  const worker = startAdaptiveWorker({ intervalMs: 5000, timers: clock.timers,
    run: async () => { if (++attempts < 4) throw Error('DB unavailable'); return true; },
    onError: () => { errors++; throw Error('logger unavailable'); },
  });
  try {
    for (const delay of [0, 5000, 10000, 20000]) {
      assert.equal(clock.nextDelay, delay);
      await clock.next();
    }
    assert.equal(errors, 3);
    assert.equal(clock.nextDelay, 5000);
  } finally { worker.stop(); }
});

test('stop during active work removes pending wakes and prevents rearming', async () => {
  const clock = workerClock();
  let release;
  const worker = startAdaptiveWorker({ intervalMs: 5000, timers: clock.timers,
    run: () => new Promise(resolve => { release = resolve; }),
  });
  const running = clock.next();
  worker.wake();
  worker.stop(); worker.stop(); worker.wake();
  release(true); await running;
  assert.equal(clock.size, 0);
});

test('stop before startup clears its unreferenced timer', async () => {
  const clock = workerClock();
  const worker = startAdaptiveWorker({ intervalMs: 5000, timers: clock.timers, run: () => assert.fail('stopped worker ran') });
  worker.stop(); worker.wake();
  assert.equal(clock.size, 0);
});
