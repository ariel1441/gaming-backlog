import test from "node:test";
import assert from "node:assert/strict";
import { normStatus, rawStatusesForGroup, statusGroupOf } from "./status.js";

test("normStatus trims and lowercases status values", () => {
  assert.equal(normStatus("  Playing  "), "playing");
  assert.equal(normStatus(null), "");
});

test("statusGroupOf maps canonical statuses to semantic groups", () => {
  assert.equal(statusGroupOf("plan to play"), "planned");
  assert.equal(statusGroupOf("played and should come back"), "playing");
  assert.equal(statusGroupOf("finished"), "done");
});

test("statusGroupOf tolerates supported done spelling variant", () => {
  assert.equal(statusGroupOf("played a lot but didn't finish"), "done");
});

test("rawStatusesForGroup returns configured raw labels", () => {
  assert.ok(rawStatusesForGroup("planned").includes("plan to play"));
  assert.deepEqual(rawStatusesForGroup("missing"), []);
});

