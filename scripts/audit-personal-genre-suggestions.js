import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../backend/db.js";
import { listPersonalGenres } from "../backend/services/personalGenreService.js";
import { buildPersonalGenreSuggestions } from "../backend/services/personalGenreSuggestionService.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueFor = (flag) => args[args.indexOf(flag) + 1];
const userId = Number(valueFor("--user-id"));
const outputPath = valueFor("--output");

if (!Number.isInteger(userId) || userId <= 0 || !outputPath) {
  throw new Error("Usage: node scripts/audit-personal-genre-suggestions.js --user-id <id> --output <absolute-path>");
}

const output = path.resolve(outputPath);
if (output === root || output.startsWith(`${root}${path.sep}`)) {
  throw new Error("Write the private audit outside the repository.");
}

const usefulTagTerms = [
  "rogue", "soul", "shooter", "deck", "card", "city", "build", "co-op",
  "co op", "survival", "strategy", "horror", "stealth", "relax", "cozy",
  "open world", "metroidvania", "platform", "beat", "character action",
  "hack and slash", "visual novel", "interactive fiction", "role-playing",
  "rpg", "indie",
];

function names(value) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item : item?.name).filter(Boolean)
    : [];
}

function join(values) {
  return values.length ? values.join(", ") : "—";
}

function escapeCell(value) {
  return String(value || "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

let client;
try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  const personalGenres = await listPersonalGenres(client, userId);
  const { rows } = await client.query(
    `SELECT g.id,
            g.name,
            cg.name AS catalog_name,
            cg.metadata_quality AS catalog_metadata_quality,
            cg.rawg_playtime_hours AS catalog_rawg_playtime_hours,
            cg.genres_json AS catalog_genres_json,
            cg.tags_json AS catalog_tags_json,
            COALESCE(
              json_agg(json_build_object('id', genre.id, 'name', genre.name)
                ORDER BY membership.position)
                FILTER (WHERE genre.id IS NOT NULL),
              '[]'::json
            ) AS personal_genres
       FROM games g
       LEFT JOIN catalog_games cg ON cg.id = g.catalog_game_id
       LEFT JOIN game_personal_genres membership
         ON membership.game_id = g.id AND membership.user_id = g.user_id
       LEFT JOIN user_personal_genres genre
         ON genre.id = membership.personal_genre_id AND genre.user_id = membership.user_id
      WHERE g.user_id = $1
      GROUP BY g.id, cg.id
      ORDER BY lower(g.name), g.id`,
    [userId],
  );

  const audits = rows.map((game) => {
    const current = Array.isArray(game.personal_genres) ? game.personal_genres : [];
    const currentIds = new Set(current.map((genre) => Number(genre.id)));
    const suggestions = buildPersonalGenreSuggestions({
      catalog: {
        name: game.catalog_name || game.name,
        metadata_quality: game.catalog_metadata_quality,
        rawg_playtime_hours: game.catalog_rawg_playtime_hours,
        genres_json: game.catalog_genres_json,
        tags_json: game.catalog_tags_json,
      },
      personalGenres,
      currentPersonalGenres: current,
    }).filter((genre) => !currentIds.has(Number(genre.id)));
    const tags = names(game.catalog_tags_json);
    return {
      ...game,
      current,
      suggestions,
      usefulTags: tags.filter((tag) => {
        const normalized = tag.toLocaleLowerCase("en-US");
        return usefulTagTerms.some((term) => normalized.includes(term));
      }),
    };
  });
  await client.query("ROLLBACK");

  const fullMetadata = audits.filter((game) => game.catalog_metadata_quality === "full");
  const withSuggestions = audits.filter((game) => game.suggestions.length);
  const byGenre = new Map();
  for (const game of withSuggestions) {
    for (const suggestion of game.suggestions) {
      const list = byGenre.get(suggestion.name) || [];
      list.push(game.name);
      byGenre.set(suggestion.name, list);
    }
  }

  const markdown = [
    "# Personal Genre Suggestion Audit",
    "",
    `Generated locally on ${new Date().toISOString()}. This report is read-only and reflects user id ${userId}.`,
    "",
    "## Summary",
    "",
    `- ${audits.length} games inspected; ${fullMetadata.length} have full RAWG metadata.`,
    `- ${withSuggestions.length} games have one or more currently missing suggestions.`,
    `- ${audits.length - fullMetadata.length} games cannot be evaluated until metadata is complete.`,
    "",
    "## Current proposed additions by personal genre",
    "",
    ...[...byGenre.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([genre, games]) => `- **${genre}** (${games.length}): ${games.join(", ")}`),
    "",
    "## Every game",
    "",
    "| Game | Current personal genres | Proposed additions | RAWG genres | Relevant RAWG tags | Metadata |",
    "| --- | --- | --- | --- | --- | --- |",
    ...audits.map((game) => [
      escapeCell(game.name),
      escapeCell(join(game.current.map((genre) => genre.name))),
      escapeCell(join(game.suggestions.map((genre) => `${genre.name} (${genre.reason})`))),
      escapeCell(join(names(game.catalog_genres_json))),
      escapeCell(join(game.usefulTags)),
      escapeCell(game.catalog_metadata_quality || "unlinked"),
    ].join(" | ").replace(/^/, "| ").concat(" |")),
    "",
  ].join("\n");

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, markdown, "utf8");
  console.log(`Wrote ${audits.length} games to ${output}`);
} finally {
  try { await client?.query("ROLLBACK"); } catch {}
  client?.release();
  await pool.end();
}
