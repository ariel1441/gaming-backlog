import assert from "node:assert/strict";
import test from "node:test";
import { insightsQuerySchema } from "./insights.js";
import { listSchemas } from "./lists.js";

test("insights query accepts an optional bounded calendar year", () => {
  assert.deepEqual(
    insightsQuerySchema.validate({ year: "2026" }).value,
    { year: 2026 },
  );
  for (const query of [
    { year: "2026junk" },
    { year: 1999 },
    { year: 2101 },
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
