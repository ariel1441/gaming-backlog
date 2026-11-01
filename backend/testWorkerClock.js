import assert from 'node:assert/strict';

// Deterministic timer queue shared by scheduler tests; never sleeps.
export function workerClock() {
  let now = 0;
  const tasks = new Map();
  const timers = {
    setTimeout(fn, delay) {
      const handle = { unref() { handle.unreferenced = true; } };
      tasks.set(handle, { fn, at: now + delay });
      return handle;
    },
    clearTimeout(handle) { tasks.delete(handle); },
  };
  return {
    timers,
    get size() { return tasks.size; },
    get now() { return now; },
    get nextDelay() { return tasks.size ? Math.min(...[...tasks.values()].map(task => task.at)) - now : null; },
    async next() {
      const [handle, task] = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
      tasks.delete(handle);
      assert.equal(handle.unreferenced, true);
      now = task.at;
      await task.fn();
    },
    async advanceTo(target) {
      while (tasks.size && now + this.nextDelay <= target) await this.next();
      now = target;
    },
  };
}
