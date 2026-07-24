import assert from "node:assert/strict";
import test from "node:test";

test("public game serialization is database-only even with a warm RAWG cache", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RAWG_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("public profiles must not call RAWG");
  };
  const rawgCache = {
    "catalog game": { background_image: "https://img.example/wrong.jpg" },
    "legacy game": { background_image: "https://img.example/wrong-legacy.jpg" },
  };
  const app = { locals: { rawgCache } };
  const games = [
    {
      id: 1,
      name: "Private Name",
      catalog_game_id: 10,
      catalog_name: "Catalog Game",
      catalog_cover_url: "https://img.example/catalog.jpg",
      catalog_released_at: "2024-01-02",
      catalog_genres_json: ["RPG"],
      catalog_metadata_quality: "full",
      resume_note: "Private boss strategy",
      thoughts: "Private reflection",
      my_score: 9,
    },
    {
      id: 2,
      name: "Legacy Game",
      cover: "https://img.example/persisted.jpg",
    },
  ];
  try {
    const { serializePublicGames } = await import("./public.js");
    const hydrated = serializePublicGames(games);
    assert.equal(hydrated.length, 2);
    assert.equal(calls, 0);
    assert.equal(hydrated[0].displayName, "Catalog Game");
    assert.equal(hydrated[0].cover, "https://img.example/catalog.jpg");
    assert.equal(hydrated[0].genres, "RPG");
    assert.equal(hydrated[0].metadataQuality, "full");
    assert.equal("resume_note" in hydrated[0], false);
    assert.equal("thoughts" in hydrated[0], false);
    assert.equal("my_score" in hydrated[0], false);
    assert.equal(hydrated[1].cover, "https://img.example/persisted.jpg");
    assert.equal(hydrated[1].releaseDate, null);
    assert.equal(Object.keys(app.locals.rawgCache).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalKey;
  }
});
