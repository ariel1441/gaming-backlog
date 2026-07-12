import test from "node:test";
import assert from "node:assert/strict";
import { affectsInsights } from "./insightsInvalidation.js";

test("affectsInsights covers hour policy and ignores notes-only edits", () => {
  const base = {
    status: "finished",
    how_long_to_beat: 20,
    hours_preferred_source: "auto",
    hours_locked: false,
  };
  assert.equal(
    affectsInsights(base, { ...base, hours_preferred_source: "steam_actual" }),
    true
  );
  assert.equal(affectsInsights(base, { ...base, hours_locked: true }), true);
  assert.equal(
    affectsInsights({ ...base, thoughts: "old" }, { ...base, thoughts: "new" }),
    false
  );
});
