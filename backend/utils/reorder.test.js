import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSameRank,
  buildReorderedRankList,
  resolveTargetStatus,
} from "./reorder.js";

test("resolveTargetStatus preserves status when omitted", () => {
  assert.equal(resolveTargetStatus("finished"), "finished");
  assert.equal(resolveTargetStatus("finished", " Playing "), "playing");
});

test("assertSameRank rejects unknown and cross-rank moves", () => {
  assert.doesNotThrow(() => assertSameRank(12, 12));
  assert.throws(() => assertSameRank(null, 12), /unknown status\/rank/);
  assert.throws(() => assertSameRank(11, 12), /Cross-rank reorder not allowed/);
});

test("buildReorderedRankList moves and clamps rank positions", () => {
  const peers = [
    { id: 1, position: 0 },
    { id: 2, position: 1000 },
    { id: 3, position: 2000 },
  ];

  assert.deepEqual(
    buildReorderedRankList(peers, 1, 2).map((row) => row.id),
    [2, 3, 1]
  );
  assert.deepEqual(
    buildReorderedRankList(peers, 3, -10).map((row) => row.id),
    [3, 1, 2]
  );
});

test("buildReorderedRankList rejects missing dragged game", () => {
  assert.throws(() => buildReorderedRankList([{ id: 1 }], 2, 0), /target rank/);
});
