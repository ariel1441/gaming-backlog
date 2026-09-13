import test from "node:test";
import assert from "node:assert/strict";
import { steamPlayDate } from "./steamPlayDate.js";

test("Steam evidence uses Jerusalem calendar boundaries in summer and winter", () => {
  assert.equal(steamPlayDate("2026-09-11T20:59:59Z"), "2026-09-11");
  assert.equal(steamPlayDate("2026-09-11T21:00:00Z"), "2026-09-12");
  assert.equal(steamPlayDate("2026-01-11T21:59:59Z"), "2026-01-11");
  assert.equal(steamPlayDate(new Date("2026-01-11T22:00:00Z")), "2026-01-12");
  assert.equal(steamPlayDate("2026-09-11"), "2026-09-11");
});

test("missing or invalid evidence remains unknown", () => {
  for (const value of [null, undefined, "", "invalid", "2026-02-30"]) {
    assert.equal(steamPlayDate(value), null);
  }
});
