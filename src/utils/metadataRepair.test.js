import test from "node:test";
import assert from "node:assert/strict";
import {
  groupMetadataCandidates,
  metadataJobProgress,
} from "./metadataRepair.js";

test("metadataJobProgress clamps progress and identifies active jobs", () => {
  assert.deepEqual(
    metadataJobProgress({ status: "running", totalCount: 8, processedCount: 3 }),
    { total: 8, processed: 3, percent: 38, active: true },
  );
  assert.equal(
    metadataJobProgress({ status: "completed", totalCount: 2, processedCount: 9 })
      .percent,
    100,
  );
});

test("groupMetadataCandidates keeps alternatives under their private game", () => {
  const groups = groupMetadataCandidates([
    { id: 1, gameId: 10, gameName: "Hades" },
    { id: 2, gameId: 10, gameName: "Hades" },
    { id: 3, gameId: 11, gameName: "Celeste" },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => [group.gameId, group.candidates.length]),
    [
      [10, 2],
      [11, 1],
    ],
  );
});
