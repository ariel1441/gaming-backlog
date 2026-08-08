import assert from "node:assert/strict";
import test from "node:test";
import {
  assertGenreFieldsMatch,
  cleanPersonalGenreName,
  genreEntriesFromGameBody,
  normalizePersonalGenreName,
  parseLegacyPersonalGenres,
} from "./personalGenreService.js";

test("personal genre normalization trims, collapses whitespace, and compares case-insensitively", () => {
  assert.equal(cleanPersonalGenreName("  Cozy   Strategy  "), "Cozy Strategy");
  assert.equal(normalizePersonalGenreName("  Cozy   Strategy  "), "cozy strategy");
});

test("legacy personal genres preserve first-seen order and case-insensitive uniqueness", () => {
  assert.deepEqual(
    parseLegacyPersonalGenres(" RPG, cozy, rpg, , Cozy  Games "),
    ["RPG", "cozy", "Cozy Games"],
  );
});

test("structured personal genres win while contradictory dual fields are rejected", () => {
  assert.deepEqual(
    genreEntriesFromGameBody({ personal_genres: [{ name: "RPG" }] }),
    [{ name: "RPG" }],
  );
  assert.throws(
    () => genreEntriesFromGameBody({ personal_genres: ["RPG"], my_genre: "Cozy" }),
    /do not match/,
  );
  assert.throws(
    () => assertGenreFieldsMatch(
      { personal_genres: [{ id: 7 }], my_genre: "Cozy" },
      [{ id: 7, name: "RPG" }],
    ),
    /do not match/,
  );
});

test("edit compatibility can preserve assignments when neither genre field is sent", () => {
  assert.equal(genreEntriesFromGameBody({}, { preserveWhenMissing: true }), null);
  assert.deepEqual(genreEntriesFromGameBody({ my_genre: "RPG, Cozy" }), [
    "RPG",
    "Cozy",
  ]);
});
