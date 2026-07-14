import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const runtimeFiles = [
  new URL("./index.js", import.meta.url),
  new URL("./routes/games.js", import.meta.url),
  new URL("../src/hooks/useGames.js", import.meta.url),
  new URL("../src/services/gameService.js", import.meta.url),
];

test("runtime application code does not depend on the legacy RAWG JSON cache", async () => {
  for (const file of runtimeFiles) {
    const source = await fs.readFile(file, "utf8");
    assert.doesNotMatch(source, /cached_rawg_data|rawgCache|hydrate-covers/);
  }
});

test("historical RAWG JSON remains available only through the offline importer", async () => {
  const source = await fs.readFile(
    new URL("../scripts/import-rawg-cache.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /cached_rawg_data\.json/);
  assert.match(source, /--confirm-production/);
});
