import test from "node:test";
import assert from "node:assert/strict";
import { finishedInsertionIndex } from "./finishedPosition.js";

const peers = (scores) => scores.map((my_score, index) => ({ id: index + 1, my_score }));
for (const [name, scores, score, expected] of [
  ["below the last exact match", [9, 8, null, 8, 7], 8, 4],
  ["below the nearest higher score", [9, 8.5, null, 7], 8, 2],
  ["above the first nearest lower score", [9, null, 7.5, 7.5, 6], 8, 2],
  ["prefers higher on equal distance", [8.5, null, 7.5], 8, 1],
  ["equal decimal distances", [8.3, null, 8.1], 8.2, 1],
  ["below all equal higher anchors", [8.5, null, 8.5, 7.5], 8, 3],
  ["keeps manual rather than score order", [7, null, 9, 8], 8.5, 3],
  ["zero is a rating", [null, "0", null], 0, 2],
  ["appends when no scores exist", [null, null], 8, 2],
  ["empty finished group", [], 8, 0],
]) {
  test("finished insertion " + name, () => {
    const rows = peers(scores);
    assert.equal(finishedInsertionIndex(rows, score), expected);
    assert.deepEqual(rows, peers(scores));
  });
}
