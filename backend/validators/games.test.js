import test from "node:test";
import assert from "node:assert/strict";
import { gameSchemas } from "./games.js";

const base = { name: "Hades", status: "playing" };

test("game id params require a positive integer id", () => {
  assert.equal(gameSchemas.idParams.validate({ id: 12 }).error, undefined);
  assert.match(
    gameSchemas.idParams.validate({ id: 0 }).error.message,
    /id must be positive/
  );
});

test("upsert body normalizes status and validates required fields", () => {
  const { value, error } = gameSchemas.upsertBody.validate({
    name: "  Hades  ",
    status: "  Playing  ",
  });

  assert.equal(error, undefined);
  assert.equal(value.name, "Hades");
  assert.equal(value.status, "playing");
  assert.match(
    gameSchemas.upsertBody.validate({ status: "playing" }).error.message,
    /name is required/
  );
  assert.equal(
    gameSchemas.upsertBody.validate({ name: "Hades", status: " missing " })
      .value.status,
    "missing"
  );
});

test("game date validation accepts real dates and rejects impossible dates", () => {
  assert.equal(
    gameSchemas.upsertBody.validate({ ...base, started_at: "2024-02-29" }).error,
    undefined,
  );
  for (const value of ["2023-02-29", "2026-02-31", "2026-13-01", "not-date"]) {
    const result = gameSchemas.upsertBody.validate({ ...base, started_at: value });
    assert.ok(result.error, `${value} should be rejected`);
  }
});

test("game date validation preserves nullable and ordered ranges", () => {
  assert.equal(
    gameSchemas.upsertBody.validate({ ...base, started_at: null, finished_at: null }).error,
    undefined,
  );
  assert.ok(
    gameSchemas.upsertBody.validate({
      ...base,
      started_at: "2026-07-12",
      finished_at: "2026-07-11",
    }).error,
  );
});

test("reorder body requires target index and optional normalized status", () => {
  const { value, error } = gameSchemas.reorderBody.validate({
    targetIndex: 2,
    status: " Finished ",
  });

  assert.equal(error, undefined);
  assert.equal(value.status, "finished");
  assert.match(
    gameSchemas.reorderBody.validate({ targetIndex: -1 }).error.message,
    /targetIndex must be >= 0/
  );
  assert.match(
    gameSchemas.reorderBody.validate({ status: "playing" }).error.message,
    /targetIndex is required/
  );
});

test("favorites body accepts up to five unique game ids", () => {
  assert.equal(
    gameSchemas.favoritesBody.validate({ favoriteIds: [1, 2, 3, 4, 5] }).error,
    undefined
  );
  assert.equal(
    gameSchemas.favoritesBody.validate({ favoriteIds: [] }).error,
    undefined
  );
  assert.match(
    gameSchemas.favoritesBody.validate({ favoriteIds: [1, 2, 3, 4, 5, 6] })
      .error.message,
    /at most 5/
  );
  assert.match(
    gameSchemas.favoritesBody.validate({ favoriteIds: [1, 1] }).error.message,
    /duplicate/
  );
});

test("finish body requires a date and accepts optional values as null", () => {
  const valid = gameSchemas.finishBody.validate({
    finished_at: "2026-07-18",
    my_score: null,
    thoughts: null,
  });
  assert.equal(valid.error, undefined);
  assert.ok(
    gameSchemas.finishBody.validate({
      finished_at: null,
      my_score: 8,
      thoughts: "Great ending.",
    }).error,
  );
  assert.match(
    gameSchemas.finishBody.validate({
      finished_at: "2026-07-18",
      my_score: 11,
      thoughts: null,
    }).error.message,
    /between 0 and 10/,
  );
});

test("resume notes allow blank clearing and reject values over 1000 characters", () => {
  const blank = gameSchemas.upsertBody.validate({
    ...base,
    resume_note: "   ",
  });
  assert.equal(blank.error, undefined);
  assert.equal(blank.value.resume_note, "");
  assert.match(
    gameSchemas.upsertBody.validate({
      ...base,
      resume_note: "x".repeat(1001),
    }).error.message,
    /resume_note must be <= 1000 chars/,
  );
});
