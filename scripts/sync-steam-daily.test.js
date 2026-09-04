import test from "node:test";
import assert from "node:assert/strict";
import { runDailySteamSync } from "./sync-steam-daily.js";

test("daily Steam runner continues after one user fails", async () => {
  const enqueued = [];
  const errors = [];
  const totals = await runDailySteamSync({
    listUsers: async () => [1, 2, 3],
    enqueue: async (userId, options) => {
      enqueued.push([userId, options]);
      if (userId === 2) throw new Error("private");
      return { id: `job-${userId}` };
    },
    waitForJob: async (userId) => ({
      status: "completed",
      result: { run: { status: userId === 3 ? "partial" : "succeeded" } },
    }),
    logger: {
      error: (message) => errors.push(message),
      log: () => {},
    },
  });

  assert.deepEqual(enqueued, [
    [1, { trigger: "scheduled", force: false }],
    [2, { trigger: "scheduled", force: false }],
    [3, { trigger: "scheduled", force: false }],
  ]);
  assert.deepEqual(totals, {
    eligible: 3,
    succeeded: 1,
    partial: 1,
    failed: 1,
    skipped: 0,
  });
  assert.equal(errors.length, 1);
});

test("daily Steam runner continues after waiting for one job times out", async () => {
  const waited = [];
  const errors = [];
  const totals = await runDailySteamSync({
    listUsers: async () => [1, 2],
    enqueue: async (userId) => ({ id: `job-${userId}` }),
    waitForJob: async (userId) => {
      waited.push(userId);
      if (userId === 1) {
        const error = new Error("Timed out waiting for the Steam sync job.");
        error.code = "steam_sync_wait_timeout";
        throw error;
      }
      return {
        status: "completed",
        result: { run: { status: "succeeded" } },
      };
    },
    logger: {
      error: (message) => errors.push(message),
      log: () => {},
    },
  });

  assert.deepEqual(waited, [1, 2]);
  assert.deepEqual(totals, {
    eligible: 2,
    succeeded: 1,
    partial: 0,
    failed: 1,
    skipped: 0,
  });
  assert.match(errors[0], /Timed out waiting/);
});
