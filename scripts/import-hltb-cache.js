import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { normalizeTitle } from "../backend/utils/hltb.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cachePath = path.join(root, "backend/data/hltb_data.json");
const metrics = [
  ["main_story", "main"],
  ["main_plus_sides", "plus"],
  ["completionist", "all"],
];

// Quoted CSV, including embedded commas, quotes, CRLF and newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(value); value = "";
      if (char !== ",") {
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else value += char;
  }
  if (quoted) throw new Error("Unterminated CSV quote.");
  if (value !== "" || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift();
  const required = ["id", "name", "source_url", "crawled_at", ...metrics.map(([column]) => column)];
  if (!headers || new Set(headers).size !== headers.length || required.some((key) => !headers.includes(key))) {
    throw new Error("Unsupported CSV: expected HLTB id/name, three duration columns, source_url and crawled_at.");
  }
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has the wrong column count.`);
    return Object.fromEntries(headers.map((key, i) => [key, cells[i]]));
  });
}

function seconds(value) {
  if (value == null || String(value).trim() === "") return null;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) throw new Error("Invalid HLTB duration.");
  return hours > 0 ? Math.max(1, Math.round(hours * 3600)) : null;
}

export function mergeSnapshot(existing, source) {
  if (!Array.isArray(existing) || !existing.length || !source.length) throw new Error("Refusing an empty or unsupported dataset.");
  const rows = existing.map((row) => ({ ...row }));
  const oldTitles = new Map();
  for (const [index, row] of rows.entries()) {
    if (!["string", "number"].includes(typeof row.game_game_name) || !String(row.game_game_name).trim()) throw new Error("Unsupported existing cache row.");
    const key = normalizeTitle(row.game_game_name);
    oldTitles.set(key, [...(oldTitles.get(key) || []), index]);
  }
  const sourceTitles = new Map(), ids = new Set();
  const report = { sourceRows: source.length, sourceTimedRows: 0, added: 0, refreshed: 0, unchanged: 0, ambiguousTitles: 0, resolvedExactTitles: 0, legacyFallbackMetrics: 0 };
  const dates = [];
  for (const row of source) {
    if (!/^\d+$/.test(row.id) || ids.has(row.id) || !row.name.trim() || row.source_url !== `https://howlongtobeat.com/game/${row.id}` || !Number.isFinite(Date.parse(row.crawled_at))) {
      throw new Error("Invalid or duplicate HLTB identity/provenance.");
    }
    ids.add(row.id);
    const values = metrics.map(([column]) => seconds(row[column]));
    if (values.some((value) => value != null)) report.sourceTimedRows++;
    const key = normalizeTitle(row.name);
    const item = { row, values };
    sourceTitles.set(key, [...(sourceTitles.get(key) || []), item]);
    dates.push(row.crawled_at);
  }
  if (!report.sourceTimedRows) throw new Error("Snapshot has no supported estimates.");
  for (const [key, matches] of sourceTitles) {
    if (!key || (oldTitles.get(key)?.length || 0) > 1) {
      report.ambiguousTitles++; continue;
    }
    const index = oldTitles.get(key)?.[0];
    const previous = index == null ? null : rows[index];
    let candidates = matches;
    if (matches.length > 1 && previous) {
      // A unique exact title (or established HLTB ID) can distinguish Roman/numeric aliases.
      candidates = matches.filter(({ row }) => previous.hltb_id
        ? row.id === String(previous.hltb_id)
        : row.name.trim().toLowerCase() === String(previous.game_game_name).trim().toLowerCase());
    }
    if (candidates.length !== 1) { report.ambiguousTitles++; continue; }
    if (matches.length > 1) report.resolvedExactTitles++;
    const { row, values } = candidates[0];
    if (!values.some((value) => value != null)) continue;
    if (previous?.hltb_id && String(previous.hltb_id) !== row.id) { report.ambiguousTitles++; continue; }
    if (previous?.hltb_crawled_at && Date.parse(previous.hltb_crawled_at) > Date.parse(row.crawled_at)) {
      throw new Error(`Refusing an older snapshot for ${row.name}.`);
    }
    const next = { ...(previous || { game_game_name: row.name }) };
    const legacyFallback = [];
    metrics.forEach(([, suffix], i) => {
      const medianKey = `game_comp_${suffix}_med`, averageKey = `game_comp_${suffix}_avg`;
      if (values[i] != null) {
        delete next[medianKey];
        next[averageKey] = values[i];
      } else if (Number(next[medianKey]) > 0 || Number(next[averageKey]) > 0) {
        legacyFallback.push(suffix); report.legacyFallbackMetrics++;
      }
    });
    next.hltb_id = Number(row.id);
    next.hltb_crawled_at = row.crawled_at;
    next.hltb_source_url = row.source_url;
    if (legacyFallback.length) next.hltb_legacy_fallback_fields = legacyFallback;
    else delete next.hltb_legacy_fallback_fields;
    if (previous) {
      if (JSON.stringify(previous) === JSON.stringify(next)) report.unchanged++;
      else { rows[index] = next; report.refreshed++; }
    } else { rows.push(next); report.added++; }
  }
  dates.sort();
  return { rows, report: { ...report, previousRows: existing.length, outputRows: rows.length, retainedRows: existing.length - report.refreshed - report.unchanged, sourceOldest: dates[0], sourceNewest: dates.at(-1) } };
}

async function atomicWrite(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try { await fs.writeFile(temporary, text, { flag: "wx" }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

export async function replaceCache(file, current, output) {
  if (await fs.readFile(file, "utf8") !== current) throw new Error("Cache changed during import.");
  if (output === current) return;
  const digest = createHash("sha256").update(current).digest("hex").slice(0, 16);
  const backup = `${file}.${digest}.bak`;
  try { await fs.copyFile(file, backup, 1); }
  catch (error) {
    if (error.code !== "EEXIST" || await fs.readFile(backup, "utf8") !== current) throw error;
  }
  await atomicWrite(file, output);
}
export async function run(argv) {
  const options = Object.fromEntries(argv.filter((arg) => arg.includes("=")).map((arg) => {
    const index = arg.indexOf("="); return [arg.slice(0, index), arg.slice(index + 1)];
  }));
  if (argv.some((arg) => arg !== "--apply" && !/^--(input|output|source)=.+/.test(arg)) || !options["--input"]) {
    throw new Error("Usage: node scripts/import-hltb-cache.js --input=file.csv [--source=URL] [--output=candidate.json | --apply]");
  }
  if (argv.includes("--apply") && options["--output"]) throw new Error("Choose --output or --apply.");
  const input = await fs.readFile(path.resolve(root, options["--input"]), "utf8");
  const current = await fs.readFile(cachePath, "utf8");
  const { rows, report } = mergeSnapshot(JSON.parse(current.replace(/^\uFEFF/, "")), parseCsv(input));
  const target = argv.includes("--apply") ? cachePath : options["--output"] ? path.resolve(root, options["--output"]) : null;
  if (target === cachePath && !argv.includes("--apply")) throw new Error("Replacing the active cache requires --apply.");
  const result = { ...report, source: options["--source"] || path.basename(options["--input"]), inputSha256: createHash("sha256").update(input).digest("hex"), units: "seconds", statistic: "average; retained legacy estimates where unavailable", mode: target ? argv.includes("--apply") ? "applied" : "candidate" : "dry-run" };
  if (target) {
    if (target === path.resolve(root, options["--input"])) throw new Error("Output cannot replace the source CSV.");
    const output = `${JSON.stringify(rows, null, 2)}\n`;
    if (target === cachePath) {
      await replaceCache(cachePath, current, output);
    } else await atomicWrite(target, output);
    await atomicWrite(`${target}.manifest.json`, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
