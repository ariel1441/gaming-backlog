import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { normalizeGameTitle } from "../backend/utils/gameTitle.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

export function decodeSteamText(value) {
  return String(value || "")
    .replace(/&trade;/gi, "™")
    .replace(/&reg;/gi, "®")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

const MONTHS = new Map([
  ["Jan", "01"], ["Feb", "02"], ["Mar", "03"], ["Apr", "04"],
  ["May", "05"], ["Jun", "06"], ["Jul", "07"], ["Aug", "08"],
  ["Sep", "09"], ["Oct", "10"], ["Nov", "11"], ["Dec", "12"],
]);

export function parseLicenseDate(value) {
  const match = /^(\d{1,2}) ([A-Z][a-z]{2}), (\d{4})$/.exec(String(value || "").trim());
  if (!match || !MONTHS.has(match[2])) return null;
  return `${match[3]}-${MONTHS.get(match[2])}-${match[1].padStart(2, "0")}`;
}

function argValue(argv, name) {
  const exact = argv.indexOf(name);
  if (exact >= 0) return argv[exact + 1] || null;
  const prefix = `${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function assertTarget(databaseUrl, { production, apply, argv }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const parsed = new URL(databaseUrl);
  const local = LOCAL_HOSTS.has(parsed.hostname);
  if (!production && !local) throw new Error(`Refusing non-local target "${parsed.host}" without --production.`);
  if (production && local) throw new Error("Production target must not be localhost.");
  if (production && apply) {
    const confirmed = argv.includes("--confirm-production")
      && String(process.env.CONFIRM_PROD_BACKLOG_ADDED_AT_BACKFILL).toLowerCase() === "true";
    if (!confirmed) {
      throw new Error("Production apply requires --confirm-production and CONFIRM_PROD_BACKLOG_ADDED_AT_BACKFILL=true.");
    }
  }
}

async function readLicenses(csvPath) {
  const [headers, ...rows] = parseCsv(await fs.readFile(csvPath, "utf8"));
  if (headers.join("|") !== "Date|Item|Acquisition Method") {
    throw new Error(`Unexpected CSV headers: ${headers.join("|")}`);
  }
  const licenses = rows.map(([date, item, method], index) => ({
    line: index + 2,
    date: parseLicenseDate(date),
    item: decodeSteamText(item),
    method: String(method || "").trim(),
  }));
  const invalid = licenses.filter((row) => !row.date || !normalizeGameTitle(row.item) || !row.method);
  return { licenses: licenses.filter((row) => row.date && normalizeGameTitle(row.item)), invalid };
}

async function readOverrides(overridesPath) {
  if (!overridesPath) return new Map();
  const parsed = JSON.parse(await fs.readFile(overridesPath, "utf8"));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Overrides must be a JSON object mapping backlog titles to CSV Item values.");
  }
  return new Map(Object.entries(parsed).map(([game, license]) => [
    normalizeGameTitle(game),
    normalizeGameTitle(decodeSteamText(license)),
  ]));
}

export async function runBackfill({ client, csvPath, overridesPath, userId, apply, titleMatcher }) {
  const { licenses, invalid } = await readLicenses(csvPath);
  const overrides = await readOverrides(overridesPath);
  const byTitle = new Map();
  for (const license of licenses) {
    const normalized = normalizeGameTitle(license.item);
    if (!byTitle.has(normalized)) byTitle.set(normalized, []);
    byTitle.get(normalized).push(license);
  }

  const accounts = await client.query(`
    SELECT account.user_id, COUNT(DISTINCT source.provider_app_id)::int AS steam_games
    FROM user_external_accounts account
    LEFT JOIN user_game_sources source
      ON source.user_id = account.user_id AND source.provider = 'steam'
    WHERE account.provider = 'steam' AND account.disconnected_at IS NULL
      AND ($1::int IS NULL OR account.user_id = $1)
    GROUP BY account.user_id
    ORDER BY steam_games DESC
  `, [userId]);
  if (accounts.rows.length !== 1) {
    throw new Error(`Expected exactly one connected Steam user; found ${accounts.rows.length}. Pass --user-id when needed.`);
  }
  const targetUserId = Number(accounts.rows[0].user_id);
  const games = (await client.query(`
    SELECT g.id, g.name, g.backlog_added_at, g.backlog_added_at_source,
      catalog.name AS catalog_name, source.provider_app_id AS steam_app_id,
      candidate.steam_name
    FROM games g
    LEFT JOIN catalog_games catalog ON catalog.id = g.catalog_game_id
    JOIN user_game_sources source
      ON source.game_id = g.id AND source.user_id = g.user_id
      AND source.provider = 'steam' AND source.source_status = 'owned'
    LEFT JOIN steam_import_candidates candidate
      ON candidate.user_id = g.user_id AND candidate.steam_app_id = source.provider_app_id
    WHERE g.user_id = $1 AND LOWER(TRIM(g.status)) <> 'wishlist'
    ORDER BY g.id
    ${apply ? "FOR UPDATE OF g" : ""}
  `, [targetUserId])).rows;

  const proposals = [];
  const unmatched = [];
  for (const game of games) {
    if (game.backlog_added_at) continue;
    const displayTitle = game.steam_name || game.catalog_name || game.name;
    const titles = [...new Set([game.steam_name, game.catalog_name, game.name]
      .map(normalizeGameTitle).filter(Boolean))];
    let matches = titles.flatMap((title) => byTitle.get(title) || []);
    let matchKind = matches.length ? "exact" : null;

    if (!matches.length) {
      const override = titles.map((title) => overrides.get(title)).find(Boolean);
      if (override) {
        matches = byTitle.get(override) || [];
        matchKind = matches.length ? "override" : null;
      }
    }

    if (!matches.length && titleMatcher) {
      const ranked = licenses.map((license) => ({
        license,
        score: titleMatcher.score(displayTitle, license.item),
      })).sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const second = ranked[1];
      if (best && titleMatcher.accept(displayTitle, best.license.item)
        && best.score - (second?.score || 0) >= 0.05) {
        matches = [best.license];
        matchKind = "guarded_title";
      }
    }

    if (!matches.length) {
      unmatched.push({ gameId: Number(game.id), title: displayTitle });
      continue;
    }
    const date = matches.map((row) => row.date).sort()[0];
    proposals.push({ gameId: Number(game.id), title: displayTitle, date, matchKind });
  }

  if (apply) {
    for (const proposal of proposals) {
      await client.query(`
        UPDATE games
        SET backlog_added_at = $2::date::timestamp AT TIME ZONE 'Asia/Jerusalem',
            backlog_added_at_source = 'steam_license_history'
        WHERE id = $1 AND user_id = $3 AND backlog_added_at IS NULL
      `, [proposal.gameId, proposal.date, targetUserId]);
    }
  }

  return {
    targetUserId,
    csvRows: licenses.length + invalid.length,
    invalidCsvRows: invalid.length,
    steamLinkedBacklogGames: games.length,
    alreadyPopulated: games.filter((game) => game.backlog_added_at).length,
    proposed: proposals.length,
    exact: proposals.filter((row) => row.matchKind === "exact").length,
    guardedTitle: proposals.filter((row) => row.matchKind === "guarded_title").length,
    overrides: proposals.filter((row) => row.matchKind === "override").length,
    unmatched,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const production = argv.includes("--production");
  const csvPath = argValue(argv, "--csv");
  const overridesPath = argValue(argv, "--overrides");
  const userIdValue = argValue(argv, "--user-id");
  const userId = userIdValue == null ? null : Number(userIdValue);
  if (!csvPath) throw new Error("Usage: npm run backlog:backfill-added-at -- --csv <path> [--overrides <path>] [--apply]");
  if (userIdValue != null && (!Number.isInteger(userId) || userId <= 0)) throw new Error("--user-id must be a positive integer.");

  dotenv.config({
    path: production && !process.env.DATABASE_URL ? ".env.production.local" : ".env",
    override: production && !process.env.DATABASE_URL,
  });
  assertTarget(process.env.DATABASE_URL, { production, apply, argv });
  if (production) process.env.ALLOW_REMOTE_DB_IN_DEV = "true";
  const [{ pool }, steam] = await Promise.all([
    import("../backend/db.js"),
    import("../backend/services/steamService.js"),
  ]);
  const client = await pool.connect();
  try {
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    const result = await runBackfill({
      client,
      csvPath: path.resolve(csvPath),
      overridesPath: overridesPath ? path.resolve(overridesPath) : null,
      userId,
      apply,
      titleMatcher: {
        score: steam.bestTitleSimilarity,
        accept: steam.isLikelySteamDuplicateTitle,
      },
    });
    if (apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    console.log(JSON.stringify({ mode: apply ? (production ? "production-apply" : "local-apply") : "dry-run", ...result }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
