import test from "node:test";
import assert from "node:assert/strict";
import { gameSchemas } from "./games.js";

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
  assert.match(gameSchemas.upsertBody.validate({ status: "playing" }).error.message, /name is required/);
  assert.equal(
    gameSchemas.upsertBody.validate({ name: "Hades", status: " missing " })
      .value.status,
    "missing"
  );
});

test("upsert body validates dates", () => {
  assert.equal(
    gameSchemas.upsertBody.validate({
      name: "Hades",
      status: "playing",
      started_at: "2026-05-08",
      finished_at: null,
    }).error,
    undefined
  );
  assert.match(
    gameSchemas.upsertBody.validate({
      name: "Hades",
      status: "playing",
      started_at: "05/08/2026",
    }).error.message,
    /started_at must be YYYY-MM-DD/
  );
  assert.match(
    gameSchemas.upsertBody.validate({
      name: "Hades",
      status: "playing",
      started_at: "2026-05-08",
      finished_at: "2026-05-07",
    }).error.message,
    /finished_at cannot be before started_at/
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
