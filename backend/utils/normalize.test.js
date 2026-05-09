import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScore, roundHLTB } from "./normalize.js";
import { toDateOrNull, toHourInt } from "./time.js";

test("normalizeScore clamps and rounds to one decimal", () => {
  assert.equal(normalizeScore("8.26"), 8.3);
  assert.equal(normalizeScore(99), 10);
  assert.equal(normalizeScore(-4), 0);
  assert.equal(normalizeScore("nope"), null);
});

test("roundHLTB returns whole positive hours or null", () => {
  assert.equal(roundHLTB("12.5"), 13);
  assert.equal(roundHLTB(3000, { max: 1000 }), 1000);
  assert.equal(roundHLTB(-1), null);
  assert.equal(roundHLTB(""), null);
});

test("toHourInt only returns positive rounded hours", () => {
  assert.equal(toHourInt("3.4"), 3);
  assert.equal(toHourInt(0), null);
  assert.equal(toHourInt("bad"), null);
});

test("toDateOrNull returns canonical date strings", () => {
  assert.equal(toDateOrNull("2026-05-08"), "2026-05-08");
  assert.equal(toDateOrNull("not-a-date"), null);
  assert.equal(toDateOrNull(""), null);
});

