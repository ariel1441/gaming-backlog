import { normalizePersonalGenreName } from "./personalGenreService.js";

export const MAX_PERSONAL_GENRE_SUGGESTIONS = 5;

function metadataNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : item?.name))
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

// RAWG and Steam-adjacent metadata use several spellings for the same idea. This
// normalizer is intentionally an alias table, rather than fuzzy matching: a new
// tag must still be an explicit signal before it can suggest a personal genre.
function signalKey(value) {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SIGNAL_ALIASES = new Map([
  ["rogue lite", "roguelite"],
  ["deck building", "deckbuilder"],
  ["deck builder", "deckbuilder"],
  ["roguelike deck builder", "roguelike deckbuilder"],
  ["co op", "co op"],
  ["online co op", "co op"],
  ["local co op", "co op"],
  ["cooperative", "co op"],
  ["city building", "city builder"],
  ["role playing rpg", "rpg"],
  ["role playing", "rpg"],
  ["first person shooter", "shooter"],
  ["third person shooter", "shooter"],
  ["top down shooter", "shooter"],
  ["twin stick shooter", "shooter"],
  ["beat em up", "beat em up"],
  ["character action game", "character action"],
]);

function normalizedSignal(value) {
  const key = signalKey(value);
  return SIGNAL_ALIASES.get(key) || key;
}

function signalSet(catalog = {}) {
  return new Set(
    [...metadataNames(catalog.genres_json ?? catalog.genres), ...metadataNames(catalog.tags_json ?? catalog.tags)]
      .map(normalizedSignal)
      .filter(Boolean),
  );
}

function sourceSignalSet(value) {
  return new Set(metadataNames(value).map(signalKey).filter(Boolean));
}

function hasAny(signals, values) {
  return values.some((value) => signals.has(normalizedSignal(value)));
}

function titleKey(value) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

function titleIncludes(title, values) {
  return values.some((value) => title.includes(value));
}

function currentGenreNames(value) {
  return new Set(metadataNames(value).map((genre) => normalizePersonalGenreName(genre)));
}

const SOULSLIKE_TITLE_SIGNALS = [
  "dark souls", "demon's souls", "demons souls", "elden ring", "bloodborne",
  "sekiro", "nioh", "mortal shell", "lies of p", "lords of the fallen",
  "the surge", "thymesia", "wo long", "code vein", "salt and sanctuary",
  "remnant",
];

const INDIE_SOFT_EXCLUSIONS = [
  "tainted grail: the fall of avalon",
  "clair obscur: expedition 33",
];

const ROGUELIKE_TITLE_EXCLUSIONS = ["titan souls"];

function evidence(signals, options, fallback) {
  const matching = options.find((option) => signals.has(normalizedSignal(option)));
  return matching || fallback;
}

/**
 * Turns full, cached catalog metadata into a deliberately small set of the
 * owner's existing personal genres. Unknown custom genre names stay manual.
 * `currentPersonalGenres` provides conflict constraints only; it never causes
 * a genre to be removed or added by itself.
 */
export function buildPersonalGenreSuggestions({
  catalog,
  personalGenres = [],
  currentPersonalGenres = [],
} = {}) {
  if (catalog?.metadata_quality !== "full") return [];

  const byName = new Map(
    personalGenres
      .filter((genre) => Number.isInteger(Number(genre?.id)) && genre?.name)
      .map((genre) => [normalizePersonalGenreName(genre.name), {
        id: Number(genre.id),
        name: String(genre.name).trim(),
      }]),
  );
  if (!byName.size) return [];

  const signals = signalSet(catalog);
  const genreSignals = sourceSignalSet(catalog.genres_json ?? catalog.genres);
  const tagSignals = sourceSignalSet(catalog.tags_json ?? catalog.tags);
  const title = titleKey(catalog.name);
  const current = currentGenreNames(currentPersonalGenres);
  const hasCurrent = (name) => current.has(normalizePersonalGenreName(name));
  const suggested = new Map();
  const add = (name, reason) => {
    const genre = byName.get(normalizePersonalGenreName(name));
    if (genre && !hasCurrent(name) && !suggested.has(genre.id)) {
      suggested.set(genre.id, { ...genre, reason });
    }
  };

  const rogueTag = !ROGUELIKE_TITLE_EXCLUSIONS.includes(title) && hasAny(signals, [
    "roguelike", "roguelite", "traditional roguelike", "roguevania", "roguelike deckbuilder",
  ]);
  // "Action Roguelike" by itself has been noisy in RAWG. Require a real
  // roguelike-family tag as corroboration before treating it as that subtype.
  const actionRoguelike = rogueTag && hasAny(signals, ["action roguelike"]);
  const roguelike = rogueTag || actionRoguelike || hasCurrent("Roguelike");
  const deckOrTurnRogue = roguelike && hasAny(signals, [
    "deckbuilder", "card game", "turn based", "turn based strategy", "roguelike deckbuilder",
  ]);
  const shooter = hasAny(signals, ["shooter"]);
  const bulletHeaven = hasAny(signals, ["bullet hell", "bullet heaven", "survivor like"]);
  // A reviewed title list is safer than trusting RAWG's very noisy Souls-like tag.
  const soulslike = titleIncludes(title, SOULSLIKE_TITLE_SIGNALS) || hasCurrent("Soulslike");
  const characterAction = hasAny(signals, ["character action"]);
  const stealth = hasAny(signals, ["stealth"]);
  const relaxing = hasAny(signals, ["relaxing", "cozy"]);
  const cardGame = hasAny(signals, ["card game", "deckbuilder", "roguelike deckbuilder"]);
  const metroidvania = hasAny(signals, ["metroidvania"]) || hasCurrent("Metroidvania");
  const strategy = hasAny(tagSignals, ["strategy", "real time strategy", "turn based strategy", "grand strategy", "4x"]);
  const survival = hasAny(signals, ["survival"]);
  const focusedSurvival = survival && hasAny(signals, [
    "survival horror", "open world survival craft", "base building", "crafting", "city builder",
  ]);
  const platformer = hasAny(signals, ["platformer"]);
  const focusedPlatformer = platformer && hasAny(signals, ["precision platformer", "puzzle platformer", "2d platformer"]);
  const narrativeRpg = hasAny(signals, ["jrpg", "crpg", "party based rpg", "traditional rpg"]);
  const playtimeHours = Number(catalog.rawg_playtime_hours ?? catalog.playtime_hours);
  const longNarrativeGame = Number.isFinite(playtimeHours) && playtimeHours >= 15;

  if (soulslike) add("Soulslike", "Reviewed Soulslike title");
  if (roguelike) add("Roguelike", `RAWG: ${evidence(signals, ["traditional roguelike", "roguelite", "roguelike", "roguevania"], "Roguelike")}`);
  if (shooter && !bulletHeaven) add("Shooter", "Explicit shooter metadata");
  if (deckOrTurnRogue || cardGame) add("Card game", "RAWG card/deck metadata");
  if (hasAny(signals, ["city builder"])) add("City builder", "RAWG: City Builder");
  const strongCoOp =
    tagSignals.has("local co op") ||
    (tagSignals.has("co op") && tagSignals.has("online co op"));
  if (strongCoOp || title.includes("remnant")) {
    add("Co op", title.includes("remnant") ? "Reviewed co-op title" : "Explicit co-op metadata");
  }
  if (focusedSurvival) add("Survival", "Focused survival metadata");
  if (strategy) add("Strategy", "RAWG strategy metadata");
  if (
    (genreSignals.has("horror") || tagSignals.has("survival horror")) &&
    !characterAction && !soulslike && !hasCurrent("Relaxing") &&
    !hasCurrent("Platformer") && !hasAny(signals, ["puzzle", "family", "casual"])
  ) {
    add("Horror", "RAWG: Horror");
  }
  if (stealth && !soulslike && !characterAction) add("Stealth", "Explicit stealth metadata");
  if (relaxing && !roguelike && !soulslike && !shooter && !hasAny(signals, ["horror", "survival"])) {
    add("Relaxing", "RAWG calm/cozy metadata");
  }
  // Your catalog treats Metroidvania and Open World as mutually exclusive.
  if (
    hasAny(signals, ["open world"]) && !metroidvania && !roguelike && !strategy &&
    !hasAny(signals, ["puzzle", "simulation", "casual", "platformer"])
  ) {
    add("Open world", "RAWG: Open World");
  }
  if (hasAny(signals, ["metroidvania"]) && !soulslike && !roguelike) add("Metroidvania", "RAWG: Metroidvania");
  if (
    !soulslike && !roguelike && !shooter &&
    (characterAction || (hasAny(signals, ["beat em up"]) && hasAny(signals, ["hack and slash"])))
  ) add("Beat em up", "Character-action / beat 'em up metadata");
  if (
    focusedPlatformer && !roguelike && !soulslike && !metroidvania && !shooter && !characterAction
  ) add("Platformer", "Focused platformer metadata");
  if (
    !roguelike && !soulslike && !cardGame && !actionRoguelike && !shooter && !strategy &&
    (hasAny(signals, ["visual novel", "interactive fiction"]) || (narrativeRpg && longNarrativeGame))
  ) add("Story focus", narrativeRpg ? "Long-form narrative RPG metadata" : "Narrative-led metadata");
  if (narrativeRpg && !soulslike && !roguelike && !cardGame) add("RPG", "Specific RPG metadata");
  if (hasAny(signals, ["indie"]) && !INDIE_SOFT_EXCLUSIONS.includes(title)) add("Indie", "RAWG: Indie");
  if (
    !soulslike && !shooter && !stealth && !relaxing &&
    (actionRoguelike || (metroidvania && title !== "leap year") || characterAction || title.includes("mount & blade ii"))
  ) {
    add(
      "Action",
      actionRoguelike ? "Action Roguelike metadata" : metroidvania ? "Metroidvania action identity" : characterAction ? "Character-action metadata" : "Reviewed title exception",
    );
  }

  return [...suggested.values()].slice(0, MAX_PERSONAL_GENRE_SUGGESTIONS);
}
