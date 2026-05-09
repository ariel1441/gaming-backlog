import test from "node:test";
import assert from "node:assert/strict";
import {
  apiErrorMessage,
  buildAddGamePayload,
  buildEditGamePayload,
  canonDate,
  emptyGameForm,
  toIntOrNull,
  toNumOrNull,
} from "./backlogForm.js";

const existingGames = [{ id: 1, name: "Elden Ring" }];

test("canonDate omits empty values and keeps YYYY-MM-DD dates", () => {
  assert.equal(canonDate(""), null);
  assert.equal(canonDate(null), null);
  assert.equal(canonDate("2026-05-08T12:00:00Z"), "2026-05-08");
});

test("buildAddGamePayload requires name and status", () => {
  const result = buildAddGamePayload(emptyGameForm);
  assert.equal(result.ok, false);
  assert.equal(result.message, "Name and status are required.");
  assert.equal(result.fields.name, "Name is required.");
  assert.equal(result.fields.status, "Choose a status.");
});

test("buildAddGamePayload blocks duplicate normalized titles", () => {
  const result = buildAddGamePayload(
    { ...emptyGameForm, name: "elden-ring", status: "playing" },
    existingGames
  );
  assert.equal(result.ok, false);
  assert.equal(result.message, "\"Elden Ring\" is already in your backlog.");
  assert.equal(result.fields.name, "\"Elden Ring\" is already in your backlog.");
});

test("buildAddGamePayload rejects finished dates before started dates", () => {
  const result = buildAddGamePayload({
    ...emptyGameForm,
    name: "Hades",
    status: "playing",
    started_at: "2026-05-08",
    finished_at: "2026-05-07",
  });
  assert.equal(result.ok, false);
  assert.equal(result.message, "Finished date cannot be before started date.");
  assert.equal(
    result.fields.finished_at,
    "Finished date cannot be before started date."
  );
});

test("buildAddGamePayload omits blank dates and trims names", () => {
  const result = buildAddGamePayload({
    ...emptyGameForm,
    name: "  Hades  ",
    status: "playing",
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.name, "Hades");
  assert.equal(Object.hasOwn(result.payload, "started_at"), false);
  assert.equal(Object.hasOwn(result.payload, "finished_at"), false);
});

test("buildAddGamePayload keeps provided dates", () => {
  const result = buildAddGamePayload({
    ...emptyGameForm,
    name: "Hades",
    status: "playing",
    started_at: "2026-05-07",
    finished_at: "2026-05-08",
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.started_at, "2026-05-07");
  assert.equal(result.payload.finished_at, "2026-05-08");
});

test("number helpers normalize blank and numeric values", () => {
  assert.equal(toIntOrNull("12.9"), 12);
  assert.equal(toIntOrNull(""), null);
  assert.equal(toIntOrNull("nope"), null);
  assert.equal(toNumOrNull("8.5"), 8.5);
  assert.equal(toNumOrNull(""), null);
  assert.equal(toNumOrNull("nope"), null);
});

test("buildAddGamePayload validates numeric ranges", () => {
  const result = buildAddGamePayload({
    ...emptyGameForm,
    name: "Hades",
    status: "playing",
    how_long_to_beat: "1001",
    my_score: "11",
  });

  assert.equal(result.ok, false);
  assert.equal(result.fields.how_long_to_beat, "Use a number from 0 to 1000.");
  assert.equal(result.fields.my_score, "Use a score from 0 to 10.");
});

test("buildEditGamePayload keeps unchanged dates omitted", () => {
  const result = buildEditGamePayload(
    { name: "Hades", status: "playing", started_at: "2026-05-08" },
    { id: 1, name: "Hades", status: "playing", started_at: "2026-05-08" }
  );

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.payload, "started_at"), false);
});

test("buildEditGamePayload includes changed dates and normalized numbers", () => {
  const result = buildEditGamePayload(
    {
      name: "Hades",
      status: "playing",
      how_long_to_beat: "12.9",
      my_score: "8.5",
      started_at: "2026-05-08",
    },
    { id: 1, name: "Hades", status: "playing", started_at: null }
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.how_long_to_beat, 12);
  assert.equal(result.payload.my_score, 8.5);
  assert.equal(result.payload.started_at, "2026-05-08");
});

test("buildEditGamePayload includes changed RAWG identity", () => {
  const result = buildEditGamePayload(
    {
      name: "Hades",
      status: "playing",
      rawg_id: 123,
      rawg_slug: "hades",
    },
    { id: 1, name: "Hades", status: "playing" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.rawg_id, 123);
  assert.equal(result.payload.rawg_slug, "hades");
});

test("buildEditGamePayload validates required fields and date order", () => {
  const requiredResult = buildEditGamePayload({ name: "", status: "" });
  assert.equal(requiredResult.ok, false);
  assert.equal(requiredResult.message, "Name and status are required.");

  const dateResult = buildEditGamePayload({
    name: "Hades",
    status: "playing",
    started_at: "2026-05-08",
    finished_at: "2026-05-07",
  });
  assert.equal(dateResult.ok, false);
  assert.equal(dateResult.message, "Finished date cannot be before started date.");
});

test("apiErrorMessage reads central API error details", () => {
  assert.equal(
    apiErrorMessage(
      { details: { error: { message: "Invalid status" } } },
      "Fallback"
    ),
    "Invalid status"
  );
  assert.equal(apiErrorMessage({}, "Fallback"), "Fallback");
});
