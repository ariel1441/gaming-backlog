import test from "node:test";
import assert from "node:assert/strict";
import { statusDisplayLabel, statusOption } from "./statusDisplay.js";

test("shows Dropped without changing the legacy stored status value", () => {
  assert.equal(statusDisplayLabel("played and wont come back"), "Dropped");
  assert.deepEqual(statusOption("played and wont come back"), {
    value: "played and wont come back",
    label: "Dropped",
  });
});

test("passes other status labels through unchanged", () => {
  assert.equal(statusDisplayLabel("playing"), "playing");
  assert.equal(statusDisplayLabel(null), "");
});
