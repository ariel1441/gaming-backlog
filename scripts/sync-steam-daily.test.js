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
      if (userId === 2 && options.syncKind === "library") throw new Error("private");
      return { id: `job-${userId}-${options.syncKind}` };
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
    [1, { trigger: "scheduled", force: false, syncKind: "library" }],
    [1, { trigger: "scheduled", force: false, syncKind: "wishlist" }],
    [2, { trigger: "scheduled", force: false, syncKind: "library" }],
    [2, { trigger: "scheduled", force: false, syncKind: "wishlist" }],
    [3, { trigger: "scheduled", force: false, syncKind: "library" }],
    [3, { trigger: "scheduled", force: false, syncKind: "wishlist" }],
  ]);
  assert.deepEqual(totals, {
    eligible: 3,
    library: { succeeded: 1, partial: 1, failed: 1, skipped: 0 },
    wishlist: { succeeded: 2, partial: 1, failed: 0, skipped: 0 },
  });
  assert.equal(errors.length, 1);
});

test("daily Steam runner continues after waiting for one job times out", async () => {
  const waited = [];
  const errors = [];
  const totals = await runDailySteamSync({
    listUsers: async () => [1, 2],
    enqueue: async (userId, options) => ({ id: `job-${userId}-${options.syncKind}` }),
    waitForJob: async (userId, jobId) => {
      waited.push(jobId);
      if (jobId === "job-1-library") {
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

  assert.deepEqual(waited, ["job-1-library", "job-1-wishlist", "job-2-library", "job-2-wishlist"]);
  assert.deepEqual(totals, {
    eligible: 2,
    library: { succeeded: 1, partial: 0, failed: 1, skipped: 0 },
    wishlist: { succeeded: 2, partial: 0, failed: 0, skipped: 0 },
  });
  assert.match(errors[0], /Timed out waiting/);
});
