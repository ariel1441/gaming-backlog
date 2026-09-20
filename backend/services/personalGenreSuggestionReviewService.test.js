import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPersonalGenreSuggestions,
  getPersonalGenreSuggestionReview,
  listPersonalGenreSuggestionReviews,
} from "./personalGenreSuggestionReviewService.js";

const fullGame = {
  id: 12,
  name: "Hades",
  cover: null,
  catalog_name: "Hades",
  catalog_cover_url: "https://example.test/hades.jpg",
  catalog_metadata_quality: "full",
  catalog_rawg_playtime_hours: 20,
  catalog_genres_json: ["Action"],
  catalog_tags_json: ["Roguelite", "Indie"],
  personal_genres: [{ id: 8, name: "Indie" }],
};

function mockDb({ games = [fullGame] } = {}) {
  const calls = [];
  return {
    calls,
    async query(text, values = []) {
      calls.push({ text: String(text), values });
      const sql = String(text);
      if (sql.includes("FROM user_personal_genres genre")) {
        return {
          rows: [
            { id: 2, name: "Roguelike", usage_count: 4 },
            { id: 8, name: "Indie", usage_count: 12 },
            { id: 9, name: "Cozy", usage_count: 1 },
          ],
        };
      }
      if (sql.includes("SELECT id, name FROM user_personal_genres WHERE id = $1")) {
        const genres = new Map([[2, "Roguelike"], [8, "Indie"], [9, "Cozy"]]);
        return { rows: genres.has(values[0]) ? [{ id: values[0], name: genres.get(values[0]) }] : [] };
      }
      if (sql.includes("SELECT 1 FROM games WHERE id = $1")) return { rows: [{ '?column?': 1 }] };
      if (sql.startsWith("DELETE FROM game_personal_genres")) return { rows: [] };
      if (sql.includes("INSERT INTO game_personal_genres")) return { rows: [] };
      if (sql.startsWith("UPDATE games SET my_genre")) return { rows: [] };
      if (sql.includes("FROM games g") && sql.includes("catalog_metadata_quality")) {
        return { rows: games };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

test("single-game genre review is owner-scoped and omits genres already assigned", async () => {
  const db = mockDb();
  const review = await getPersonalGenreSuggestionReview(db, 7, 12);

  assert.deepEqual(review.game, {
    id: 12,
    name: "Hades",
    cover: "https://example.test/hades.jpg",
  });
  assert.equal(review.metadataReady, true);
  assert.deepEqual(review.suggestions.map((genre) => genre.name), ["Roguelike"]);
  assert.deepEqual(db.calls[0].values, [12, 7]);
});

test("settings review queue uses full metadata and skips games with no missing match", async () => {
  const db = mockDb({
    games: [
      fullGame,
      {
        ...fullGame,
        id: 13,
        name: "Already covered",
        catalog_tags_json: ["Indie"],
      },
    ],
  });
  const payload = await listPersonalGenreSuggestionReviews(db, 7, { limit: 50 });

  assert.equal(payload.reviews.length, 1);
  assert.equal(payload.reviews[0].game.id, 12);
  assert.match(db.calls[1].text, /cg\.metadata_quality = 'full'/);
  assert.deepEqual(db.calls[1].values, [7, 200, false, 0]);
  assert.deepEqual(payload.page, { nextOffset: null, hasMore: false });
});

test("settings review can prioritize games without any personal genres", async () => {
  const db = mockDb({
    games: [{
      ...fullGame,
      id: 13,
      name: "No confident match",
      catalog_tags_json: [],
      personal_genres: [],
    }],
  });
  const payload = await listPersonalGenreSuggestionReviews(db, 7, {
    limit: 10,
    onlyWithoutPersonalGenres: true,
  });

  assert.match(db.calls[1].text, /NOT \$3::boolean/);
  assert.match(db.calls[1].text, /NOT EXISTS \(/);
  assert.deepEqual(db.calls[1].values, [7, 50, true, 0]);
  assert.deepEqual(payload.reviews[0].suggestions, []);
  assert.deepEqual(payload.reviews[0].currentPersonalGenres, []);
});

test("applying rejects personal genres not owned by the current user", async () => {
  const db = mockDb();
  await assert.rejects(
    () => applyPersonalGenreSuggestions(db, 7, 12, [999]),
    /owned by your account/,
  );
});

test("applying replaces current genres with an owned manual selection", async () => {
  const db = mockDb();
  const genres = await applyPersonalGenreSuggestions(db, 7, 12, [9], [8]);

  assert.deepEqual(genres.map((genre) => genre.id), [9]);
  const deleteCall = db.calls.find((call) => call.text.startsWith("DELETE FROM game_personal_genres"));
  assert.deepEqual(deleteCall.values, [12]);
});

test("applying an empty selection explicitly clears all current genres", async () => {
  const db = mockDb();
  const genres = await applyPersonalGenreSuggestions(db, 7, 12, [], [8]);

  assert.deepEqual(genres, []);
  const deleteCall = db.calls.find((call) => call.text.startsWith("DELETE FROM game_personal_genres"));
  assert.deepEqual(deleteCall.values, [12]);
  assert.equal(db.calls.some((call) => call.text.includes("INSERT INTO game_personal_genres")), false);
});

test("applying rejects a stale review before replacing genres", async () => {
  const db = mockDb();
  await assert.rejects(
    () => applyPersonalGenreSuggestions(db, 7, 12, [9], []),
    /changed since this review was loaded/,
  );
  assert.equal(db.calls.some((call) => call.text.startsWith("DELETE FROM game_personal_genres")), false);
});
