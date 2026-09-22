import test from "node:test";
import assert from "node:assert/strict";
import { decodeSteamText, parseCsv, parseLicenseDate } from "./backfill-backlog-added-at.js";

test("Steam license CSV parsing preserves quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsv('"Date","Item","Acquisition Method"\n"1 Jan, 2026","Game, The ""Best""","Retail"\n'), [
    ["Date", "Item", "Acquisition Method"],
    ["1 Jan, 2026", 'Game, The "Best"', "Retail"],
  ]);
});

test("Steam license dates become sortable calendar dates", () => {
  assert.equal(parseLicenseDate("5 Sep, 2026"), "2026-09-05");
  assert.equal(parseLicenseDate("bad"), null);
});

test("Steam HTML entities normalize before title matching", () => {
  assert.equal(decodeSteamText("NieR:Automata&trade; &amp; More"), "NieR:Automata™ & More");
});
