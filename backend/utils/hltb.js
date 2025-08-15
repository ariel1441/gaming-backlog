import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { toHourInt } from "./time.js";

/**
 * If your dataset's values are minutes or hours instead of seconds,
 * set HLTB_UNITS to "minutes" or "hours".
 * Allowed values: "seconds" | "minutes" | "hours"
 */
const HLTB_VALUE_UNITS = (process.env.HLTB_UNITS || "seconds").toLowerCase();

/* -------------------- Title normalization -------------------- */

const romanTokenToInt = (tok) => {
  const map = {
    i: 1,
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
    vii: 7,
    viii: 8,
    ix: 9,
    x: 10,
  };
  const n = map[String(tok || "").toLowerCase()];
  return n ? String(n) : tok;
};

export const normalizeTitle = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[\u2012\u2013\u2014\u2015\-:]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(romanTokenToInt)
    .join(" ");

/* -------------------- Unit conversion -------------------- */

const secondsToHoursInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n / 3600) : null;
};

const minutesToHoursInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n / 60) : null;
};

const toHoursFromConfiguredUnits = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (HLTB_VALUE_UNITS === "hours") return toHourInt(v);
  if (HLTB_VALUE_UNITS === "minutes") return minutesToHoursInt(v);
  // default: seconds
  return secondsToHoursInt(v);
};

/* -------------------- File resolution -------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveHLTBPath = async () => {
  const envPath =
    process.env.HLTB_DATA_PATH && String(process.env.HLTB_DATA_PATH).trim();
  const candidates = [
    envPath, // explicit override
    path.resolve("backend/data/hltb_data.json"), // repo root
    path.join(__dirname, "../data/hltb_data.json"), // next to utils
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
};

/* -------------------- Core loader -------------------- */

const getTitle = (row) =>
  row?.game_game_name ||
  row?.title ||
  row?.name ||
  row?.game_name ||
  row?.game ||
  row?.slug ||
  null;

const extractArrayContainer = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.data)) return parsed.data;
  return null;
};

const extractMapContainer = (parsed) => {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
    return parsed;
  return null;
};

/**
 * Load HLTB JSON into:
 *   app.locals.hltbLookup = { normalizedTitle: { main, plus, comp } }
 *
 * Expects fields like:
 *   - Main:          game_comp_main_med (fallback game_comp_main_avg)
 *   - Main + Extra:  game_comp_plus_med
 *   - Completionist: game_comp_all_med
 * Units are controlled by HLTB_VALUE_UNITS (default "seconds").
 */
export const loadHLTBLocal = async (app) => {
  const chosen = await resolveHLTBPath();
  if (!chosen) {
    app.locals.hltbLookup = {};
    return;
  }

  try {
    const txt = await fs.readFile(chosen, "utf8");
    const parsed = JSON.parse(txt.replace(/^\uFEFF/, "")); // strip BOM if present

    const lookup = {};
    const arr = extractArrayContainer(parsed);

    if (arr) {
      for (const row of arr) {
        const title = getTitle(row);
        if (!title) continue;

        const mainRaw =
          row?.game_comp_main_med ?? row?.game_comp_main_avg ?? null;
        const plusRaw = row?.game_comp_plus_med ?? null;
        const compRaw = row?.game_comp_all_med ?? null;

        const main = toHoursFromConfiguredUnits(mainRaw);
        const plus = toHoursFromConfiguredUnits(plusRaw);
        const comp = toHoursFromConfiguredUnits(compRaw);

        if (main != null || plus != null || comp != null) {
          lookup[normalizeTitle(title)] = { main, plus, comp };
        }
      }
      app.locals.hltbLookup = lookup;
      return;
    }

    const map = extractMapContainer(parsed);
    if (map) {
      for (const [k, v] of Object.entries(map)) {
        const title = getTitle(v) || k;
        if (!title) continue;

        const mainRaw = v?.game_comp_main_med ?? v?.game_comp_main_avg ?? null;
        const plusRaw = v?.game_comp_plus_med ?? null;
        const compRaw = v?.game_comp_all_med ?? null;

        const main = toHoursFromConfiguredUnits(mainRaw);
        const plus = toHoursFromConfiguredUnits(plusRaw);
        const comp = toHoursFromConfiguredUnits(compRaw);

        if (main != null || plus != null || comp != null) {
          lookup[normalizeTitle(title)] = { main, plus, comp };
        }
      }
      app.locals.hltbLookup = lookup;
      return;
    }

    // Fallback: unrecognized structure → empty lookup
    app.locals.hltbLookup = {};
  } catch {
    app.locals.hltbLookup = {};
  }
};

/* -------------------- Lookup API -------------------- */

/**
 * Get hours by preference: 'main' | 'plus' | 'comp' (default 'main').
 * Returns integer hours or null if not found.
 */
export const lookupHLTBHoursByPref = (app, rawTitle, pref = "main") => {
  if (!rawTitle) return null;
  const rec = app.locals?.hltbLookup?.[normalizeTitle(rawTitle)];
  if (!rec) return null;
  if (pref === "plus") return rec.plus ?? null;
  if (pref === "comp") return rec.comp ?? null;
  return rec.main ?? null;
};
