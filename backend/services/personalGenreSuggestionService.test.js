import test from "node:test";
import assert from "node:assert/strict";
import { buildPersonalGenreSuggestions } from "./personalGenreSuggestionService.js";

const genres = [
  "Action", "Beat em up", "Card game", "City builder", "Co op", "Horror",
  "Indie", "Metroidvania", "Open world", "Platformer", "Relaxing", "Roguelike",
  "RPG", "Shooter", "Soulslike", "Stealth", "Story focus", "Strategy", "Survival",
].map((name, index) => ({ id: index + 1, name }));

function names(catalog, currentPersonalGenres = []) {
  return buildPersonalGenreSuggestions({
    catalog,
    personalGenres: genres,
    currentPersonalGenres,
  }).map((item) => item.name);
}

test("personal genre suggestions require full catalog metadata", () => {
  assert.deepEqual(names({ name: "Hades", metadata_quality: "search_result", tags_json: ["Roguelite"] }), []);
});

test("normalizes explicit metadata aliases without fuzzy matching", () => {
  assert.deepEqual(names({
    name: "Devil May Cry 5",
    metadata_quality: "full",
    tags_json: ["Online Co-Op", "Character Action Game", "Hack and Slash"],
  }), ["Beat em up", "Action"]);
  assert.deepEqual(names({
    name: "We Were Here Forever",
    metadata_quality: "full",
    tags_json: ["Co-op", "Online Co-Op"],
  }), ["Co op"]);
});

test("roguelike subtypes avoid turning shooter and deck games into Action", () => {
  assert.deepEqual(names({
    name: "Gunfire Reborn",
    metadata_quality: "full",
    tags_json: ["Roguelite", "First-Person Shooter", "Indie"],
  }), ["Roguelike", "Shooter", "Indie"]);
  assert.deepEqual(names({
    name: "Slay the Spire",
    metadata_quality: "full",
    tags_json: ["Roguelite", "Deck Building", "Strategy"],
  }), ["Roguelike", "Card game", "Strategy"]);
});

test("an uncorroborated Action Roguelike tag does not create Roguelike or Action", () => {
  assert.deepEqual(names({
    name: "Noisy provider match",
    metadata_quality: "full",
    tags_json: ["Action Roguelike"],
  }), []);
});

test("reviewed exceptions and supporting metadata keep noisy Roguelike and Survival tags conservative", () => {
  assert.deepEqual(names({
    name: "Titan Souls",
    metadata_quality: "full",
    tags_json: ["Roguelike"],
  }), []);
  assert.deepEqual(names({
    name: "Brawlhalla-like multiplayer",
    metadata_quality: "full",
    tags_json: ["Online Co-Op", "Survival", "Indie"],
  }), ["Indie"]);
  assert.deepEqual(names({
    name: "Focused survival builder",
    metadata_quality: "full",
    tags_json: ["Survival", "Base Building"],
  }), ["Survival"]);
});

test("soulslike titles and current soulslike labels suppress conflicting Action and RPG suggestions", () => {
  assert.deepEqual(names({
    name: "Nioh 2",
    metadata_quality: "full",
    genres_json: ["Action", "Role-playing (RPG)"],
    tags_json: ["Character Action Game", "Traditional RPG"],
  }), ["Soulslike"]);
  assert.deepEqual(names({
    name: "Existing soulslike",
    metadata_quality: "full",
    tags_json: ["Character Action Game", "Traditional RPG"],
  }, [{ id: 15, name: "Soulslike" }]), []);
});

test("Metroidvania blocks Open world and becomes Action except for the reviewed Leap Year exception", () => {
  assert.deepEqual(names({
    name: "Hollow Knight-like",
    metadata_quality: "full",
    tags_json: ["Metroidvania", "Open World"],
  }), ["Metroidvania", "Action"]);
  assert.deepEqual(names({
    name: "Leap Year",
    metadata_quality: "full",
    tags_json: ["Metroidvania"],
  }), ["Metroidvania"]);
  assert.deepEqual(names({
    name: "Existing Metroidvania",
    metadata_quality: "full",
    tags_json: ["Open World"],
  }, [{ id: 8, name: "Metroidvania" }]), ["Action"]);
});

test("Story focus needs narrative evidence, not a generic RPG label or length alone", () => {
  assert.deepEqual(names({
    name: "Long JRPG",
    metadata_quality: "full",
    rawg_playtime_hours: 42,
    tags_json: ["JRPG"],
  }), ["Story focus", "RPG"]);
  assert.deepEqual(names({
    name: "Long generic RPG",
    metadata_quality: "full",
    rawg_playtime_hours: 42,
    genres_json: ["Role-playing (RPG)"],
  }), []);
  assert.deepEqual(names({
    name: "Short JRPG",
    metadata_quality: "full",
    rawg_playtime_hours: 8,
    tags_json: ["JRPG"],
  }), ["RPG"]);
});

test("platformer and beat em up suggestions require focused evidence", () => {
  assert.deepEqual(names({
    name: "Inside",
    metadata_quality: "full",
    tags_json: ["Platformer", "Puzzle Platformer"],
  }), ["Platformer"]);
  assert.deepEqual(names({
    name: "Cuphead-like action platformer",
    metadata_quality: "full",
    tags_json: ["Platformer", "Character Action Game"],
  }), ["Beat em up", "Action"]);
});

test("mood and world labels reject weak puzzle, family, casual, and simulation signals", () => {
  assert.deepEqual(names({
    name: "Celeste-like platformer",
    metadata_quality: "full",
    genres_json: ["Indie", "Platformer"],
    tags_json: ["Horror"],
  }, [{ id: 10, name: "Platformer" }]), ["Indie"]);
  assert.deepEqual(names({
    name: "Poly Bridge-like sandbox",
    metadata_quality: "full",
    genres_json: ["Simulation", "Indie", "Puzzle"],
    tags_json: ["Open World"],
  }), ["Indie"]);
});

test("generic RAWG Action and RPG labels do not become personal suggestions", () => {
  assert.deepEqual(names({ name: "Broad action game", metadata_quality: "full", genres_json: ["Action", "Role-playing (RPG)"] }), []);
});

test("noisy broad genres do not become Strategy or Horror without focused tags", () => {
  assert.deepEqual(names({
    name: "Clicker-like game",
    metadata_quality: "full",
    genres_json: ["Strategy", "Simulation", "Casual"],
    tags_json: ["Co-op"],
  }), []);
  assert.deepEqual(names({
    name: "Tactical science fiction",
    metadata_quality: "full",
    genres_json: ["Strategy"],
    tags_json: ["Horror", "Turn-Based Strategy"],
  }), ["Strategy"]);
  assert.deepEqual(names({
    name: "Focused horror",
    metadata_quality: "full",
    tags_json: ["Horror", "Survival Horror"],
  }), ["Horror"]);
});
