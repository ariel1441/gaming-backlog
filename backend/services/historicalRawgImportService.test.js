import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoricalRawgImportPlan,
  executeHistoricalRawgImport,
} from "./historicalRawgImportService.js";

function payload(id, overrides = {}) {
  return {
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    description: "Full detail",
    background_image: `https://img.example/${id}.jpg`,
    updated: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

test("historical RAWG plan trusts embedded IDs and deduplicates aliases", () => {
  const first = payload(42);
  const richer = payload(77, { metacritic: 90 });
  const plan = buildHistoricalRawgImportPlan({
    "title alias": first,
    "rawg:42": { ...first },
    "older alias": payload(77),
    "richer alias": richer,
    invalid: {},
  });

  assert.deepEqual(
    plan.items.map((item) => item.rawgId),
    [42, 77],
  );
  assert.equal(plan.items[1].payloadHash.length, 64);
  assert.equal(plan.items[1].payload.metacritic, 90);
  assert.deepEqual(plan.report, {
    sourceEntries: 5,
    validEntries: 4,
    invalidEntries: 1,
    distinctRawgIds: 2,
    duplicateAliases: 1,
    conflictingPayloads: 1,
    invalidCodes: { invalid_rawg_id: 1 },
  });
});

test("historical RAWG execution resumes in bounded idempotent batches", async () => {
  const items = [1, 2, 3, 4, 5].map((rawgId) => ({
    rawgId,
    payload: payload(rawgId),
    fetchedAt: null,
  }));
  const ingested = [];
  const checkpoints = [];
  const result = await executeHistoricalRawgImport({
    items,
    startAfterRawgId: 2,
    batchSize: 2,
    ingestSnapshot: async (_payload, options) => {
      ingested.push(options.expectedRawgId);
      return { snapshotStored: options.expectedRawgId !== 4 };
    },
    onBatchComplete: async (progress) => checkpoints.push({ ...progress }),
  });

  assert.deepEqual(ingested, [3, 4, 5]);
  assert.deepEqual(
    checkpoints.map((checkpoint) => checkpoint.lastRawgId),
    [4, 5],
  );
  assert.deepEqual(result, {
    eligible: 3,
    imported: 3,
    snapshotsStored: 2,
    lastRawgId: 5,
  });
});
