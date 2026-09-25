import test from "node:test";
import assert from "node:assert/strict";
import {
  dailyPhaseDiagnostics,
  runDailySteamSync,
  runDailySteamSyncCommand,
} from "./sync-steam-daily.js";

test("rejected closeout command closes resources before any run, sync, database-list or API path", async () => {
  const calls = [];
  const forbidden = async (name) => {
    calls.push(name);
    throw new Error(`${name} must not be called`);
  };
  const result = await runDailySteamSyncCommand({
    argv: ["node", "sync-steam-daily.js", "--jerusalem-closeout"],
    observedAt: new Date("2026-09-24T03:04:00.000Z"),
    beginRun: () => forbidden("beginRun"),
    runSync: () => forbidden("runSync"),
    close: async () => { calls.push("close"); },
    logger: { log: (message) => calls.push(message), warn() {}, error() {} },
  });

  assert.deepEqual(result, { skipped: true, reason: "outside_jerusalem_closeout_hour" });
  assert.deepEqual(calls, [
    "Steam daily sync: skipped outside the 05:00 Asia/Jerusalem closeout hour.",
    "close",
  ]);
});

test("paired Railway UTC invocations execute exactly once in summer and winter", async () => {
  const begun = [];
  let syncs = 0;
  const totals = {
    library: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
    wishlist: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
    wishlist_prices: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
  };
  const invoke = (observedAt) => runDailySteamSyncCommand({
    argv: ["node", "sync-steam-daily.js", "--jerusalem-closeout"],
    observedAt: new Date(observedAt),
    beginRun: async (options) => {
      begun.push(options.idempotencyKey);
      return { id: `run-${begun.length}` };
    },
    runSync: async () => { syncs += 1; return totals; },
    finishRun: async () => {},
    failRun: async () => {},
    close: async () => {},
    logger: { log() {}, warn() {}, error() {} },
  });
  await invoke("2026-09-24T02:04:00Z");
  await invoke("2026-09-24T03:04:00Z");
  await invoke("2026-12-24T02:04:00Z");
  await invoke("2026-12-24T03:04:00Z");

  assert.equal(syncs, 2);
  assert.deepEqual(begun, ["steam-closeout:2026-09-23", "steam-closeout:2026-12-23"]);
});

test("daily runner preserves the selected account identity and counts later ineligibility as skipped", async () => {
  const selections = [];
  const totals = await runDailySteamSync({
    listUsers: async () => [{ userId: 7, accountId: 42 }],
    enqueue: async (userId, options) => {
      selections.push([userId, options.expectedAccountId]);
      return options.syncKind === "library" ? { id: "library" } : null;
    },
    waitForJob: async () => ({ status: "completed", run: { status: "succeeded" } }),
    logger: { log() {}, error() {} },
  });
  assert.deepEqual(selections, [[7, 42], [7, 42], [7, 42]]);
  assert.equal(totals.library.succeeded, 1);
  assert.equal(totals.wishlist.skipped, 1);
  assert.equal(totals.wishlist_prices.skipped, 1);
});

test("daily Steam runner continues after one user fails", async () => {
  const enqueued = [];
  const errors = [];
  const totals = await runDailySteamSync({
    listUsers: async () => [1, 2, 3].map(userId => ({ userId, accountId: userId + 10 })),
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
    [1, { trigger: "scheduled", force: false, syncKind: "library", expectedAccountId: 11 }],
    [1, { trigger: "scheduled", force: false, syncKind: "wishlist", expectedAccountId: 11 }],
    [1, { trigger: "scheduled", force: false, syncKind: "wishlist_prices", expectedAccountId: 11 }],
    [2, { trigger: "scheduled", force: false, syncKind: "library", expectedAccountId: 12 }],
    [2, { trigger: "scheduled", force: false, syncKind: "wishlist", expectedAccountId: 12 }],
    [2, { trigger: "scheduled", force: false, syncKind: "wishlist_prices", expectedAccountId: 12 }],
    [3, { trigger: "scheduled", force: false, syncKind: "library", expectedAccountId: 13 }],
    [3, { trigger: "scheduled", force: false, syncKind: "wishlist", expectedAccountId: 13 }],
    [3, { trigger: "scheduled", force: false, syncKind: "wishlist_prices", expectedAccountId: 13 }],
  ]);
  assert.deepEqual(totals, {
    eligible: 3,
    library: { succeeded: 1, partial: 1, failed: 1, skipped: 0 },
    wishlist: { succeeded: 2, partial: 1, failed: 0, skipped: 0 },
    wishlist_prices: { succeeded: 2, partial: 1, failed: 0, skipped: 0 },
  });
  assert.equal(errors.length, 1);
});

test("daily Steam runner continues after waiting for one job times out", async () => {
  const waited = [];
  const errors = [];
  const totals = await runDailySteamSync({
    listUsers: async () => [1, 2].map(userId => ({ userId, accountId: userId + 10 })),
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

  assert.deepEqual(waited, ["job-1-library", "job-1-wishlist", "job-1-wishlist_prices", "job-2-library", "job-2-wishlist", "job-2-wishlist_prices"]);
  assert.deepEqual(totals, {
    eligible: 2,
    library: { succeeded: 1, partial: 0, failed: 1, skipped: 0 },
    wishlist: { succeeded: 2, partial: 0, failed: 0, skipped: 0 },
    wishlist_prices: { succeeded: 2, partial: 0, failed: 0, skipped: 0 },
  });
  assert.match(errors[0], /steam_sync_wait_timeout/);
  assert.doesNotMatch(errors[0], /user 1/);
});

test("daily Steam runner logs redacted phase outcomes and library notification decisions", async () => {
  const logs = [];
  await runDailySteamSync({
    listUsers: async () => [{ userId: 901, accountId: 902 }],
    enqueue: async (_userId, options) => ({ id: `job-${options.syncKind}` }),
    waitForJob: async () => ({
      status: "completed",
      result: {
        run: { status: "partial" },
        summary: { newlyObserved: 2 },
        candidatesCreated: 2,
        notificationDecisions: { created: 1, baseline: 1 },
      },
    }),
    logger: { log: (message) => logs.push(message), error() {} },
  });
  const library = logs.find((message) => message.includes('"syncKind":"library"') && message.includes('"event":"finished"'));
  assert.match(library, /"newlyObserved":2/);
  assert.match(library, /"notificationDecisions":\{"created":1,"baseline":1\}/);
  assert.doesNotMatch(library, /901|902/);
});

test("daily Steam runner reports each account summary without exposing it in logs", async () => {
  const accounts = [];
  const completed = [];
  await runDailySteamSync({
    listUsers: async () => [{ userId: 7, accountId: 42 }],
    enqueue: async (_userId, options) => ({ id: options.syncKind }),
    waitForJob: async (_userId, jobId) => ({
      status: "completed",
      result: { run: { status: jobId === "wishlist_prices" ? "partial" : "succeeded" } },
    }),
    onAccountsReady: async (value) => accounts.push(...value),
    onAccountFinished: async (value) => completed.push(value),
    logger: { log() {}, error() {} },
  });
  assert.deepEqual(accounts, [{ userId: 7, accountId: 42 }]);
  assert.deepEqual(completed, [{
    userId: 7,
    accountId: 42,
    totals: {
      library: { succeeded: 1, partial: 0, failed: 0, skipped: 0 },
      wishlist: { succeeded: 1, partial: 0, failed: 0, skipped: 0 },
      wishlist_prices: { succeeded: 0, partial: 1, failed: 0, skipped: 0 },
    },
    details: {
      library: { status: "succeeded", diagnostics: { itemsSeen: 0, activityObservations: 0, activityBaselines: 0, activityDailyObservations: 0, activityUncertainObservations: 0, activityObservationChanges: 0, reviewItemsCreated: 0, librarySnapshotSucceeded: false, achievementFailures: 0, achievementUnavailable: 0, achievementSkipped: 0, achievementNewUnlocks: 0, achievementBaselineUnlocks: 0 }, notificationDecisions: null },
      wishlist: { status: "succeeded", diagnostics: { itemsSeen: 0, added: 0, removed: 0, priorityChanged: 0, metadataComplete: false, metadataFailedPages: 0 }, notificationDecisions: null },
      wishlist_prices: { status: "partial", diagnostics: { itemsSeen: 0, requests: 0, succeeded: 0, failed: 0, changed: 0, deferred: 0, pendingRetries: 0, firstAttemptSelected: 0, firstAttemptDeferred: 0, priceMode: "unknown", feedErrorCode: null, reason: null, errorCounts: {}, retryScheduled: false }, notificationDecisions: null },
    },
  }]);
});

test("daily phase diagnostics preserve partial causes without provider payloads", () => {
  assert.deepEqual(
    dailyPhaseDiagnostics("library", {
      summary: {
        total: 750,
        activityObservations: 750,
        reviewItemsCreated: 2,
        librarySnapshotSucceeded: true,
        achievementFailures: 3,
        achievementUnavailable: 7,
      },
    }),
    {
      itemsSeen: 750,
      activityObservations: 750,
      activityBaselines: 0,
      activityDailyObservations: 0,
      activityUncertainObservations: 0,
      activityObservationChanges: 0,
      reviewItemsCreated: 2,
      librarySnapshotSucceeded: true,
      achievementFailures: 3,
      achievementUnavailable: 7,
      achievementSkipped: 0,
      achievementNewUnlocks: 0,
      achievementBaselineUnlocks: 0,
    },
  );
  assert.deepEqual(
    dailyPhaseDiagnostics("wishlist_prices", {
      summary: {
        requests: 187,
        succeeded: 176,
        failed: 4,
        changed: 28,
        deferred: 268,
        pendingRetries: 4,
        priceMode: "fallback",
        feedErrorCode: "steam_http_error",
        errorCounts: { steam_price_offer_uncertain: 4 },
        errorExamples: [{ appId: "private", message: "do not log" }],
      },
    }),
    {
      itemsSeen: 0,
      requests: 187,
      succeeded: 176,
      failed: 4,
      changed: 28,
      deferred: 268,
      pendingRetries: 4,
      firstAttemptSelected: 0,
      firstAttemptDeferred: 0,
      priceMode: "fallback",
      feedErrorCode: "steam_http_error",
      reason: null,
      errorCounts: { steam_price_offer_uncertain: 4 },
      retryScheduled: false,
    },
  );
});
