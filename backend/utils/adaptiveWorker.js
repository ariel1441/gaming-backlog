// One unreferenced timer and at most one active drain. A local wake is a hint;
// capped polling still discovers other processes' enqueues and expired leases.
export function startAdaptiveWorker({
  run,
  intervalMs,
  maxIdleMs = 60_000,
  onError = console.error,
  timers = globalThis,
}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 ||
      !Number.isSafeInteger(maxIdleMs) || maxIdleMs < intervalMs) {
    throw new RangeError('Worker intervals must be positive integers with maxIdleMs >= intervalMs.');
  }
  let timer = null;
  let running = false;
  let stopped = false;
  let pendingWake = false;
  let idleMs = intervalMs;

  function schedule(delay) {
    if (stopped) return;
    timer = timers.setTimeout(tick, delay);
    timer.unref?.();
  }

  async function tick() {
    timer = null;
    if (stopped) return;
    running = true;
    let worked = false;
    try {
      worked = Boolean(await run());
    } catch (error) {
      // Logging must not leave the worker permanently unscheduled.
      try { onError(error); } catch {}
    } finally {
      running = false;
      if (pendingWake) {
        pendingWake = false;
        idleMs = intervalMs;
        schedule(0);
      } else if (worked) {
        idleMs = intervalMs;
        schedule(intervalMs);
      } else {
        schedule(idleMs);
        idleMs = Math.min(idleMs * 2, maxIdleMs);
      }
    }
  }

  function wake() {
    if (stopped) return;
    idleMs = intervalMs;
    if (running) {
      pendingWake = true; // Do not lose enqueues arriving during the final claim.
    } else {
      if (timer !== null) timers.clearTimeout(timer);
      schedule(0);
    }
  }

  function stop() {
    stopped = true;
    pendingWake = false;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    // Existing work is allowed to finish; its finally block cannot reschedule.
  }

  schedule(0);
  return { wake, stop };
}
