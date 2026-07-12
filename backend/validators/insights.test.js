import assert from "node:assert/strict";
import test from "node:test";
import { insightsQuerySchema } from "./insights.js";
import { listSchemas } from "./lists.js";

test("insights query accepts only bounded integers and explicit booleans", () => {
  assert.deepEqual(
    insightsQuerySchema.validate({ weekly_hours: "20", include_missing_names: "true" }).value,
    { weekly_hours: 20, include_missing_names: true },
  );
  for (const query of [
    { weekly_hours: "10junk" },
    { weekly_hours: 201 },
    { include_missing_names: "yes" },
    { surprise: "field" },
  ]) {
    assert.ok(insightsQuerySchema.validate(query).error);
  }
});

test("list update rejects listType instead of silently ignoring it", () => {
  const valid = listSchemas.updateBody.validate({ name: "Favorites", description: "" });
  assert.equal(valid.error, undefined);
  assert.ok(
    listSchemas.updateBody.validate({ name: "Favorites", listType: "smart" }).error,
  );
});
