// backend/routes/insights.js
import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheGet, cacheSet } from "../utils/microCache.js";
import { lookupHLTBHoursByPref } from "../utils/hltb.js";

const router = express.Router();

/** ---- Status groupings (your final sets) ---- */
const DONE_SET = new Set([
  "finished",
  "played alot but didnt finish",
  "played a lot but didn't finish",
]);
const PLAYING_SET = new Set(["playing", "played and should come back"]);
const PLANNED_SET = new Set([
  "plan to play soon",
  "plan to play",
  "play when in the mood",
  "maybe in the future",
]);
const OTHER_SET = new Set([
  "recommended by someone",
  "wishlist",
  "not anytime soon",
  "played a bit",
]);

const DEFAULT_WEEKLY_HOURS = 10;

/* --------------------------- shared helpers --------------------------- */
/** MUST match games.js RAWG keying */
const lowerKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function getRawgHours(rawg) {
  if (!rawg) return null;
  const candidates = [
    rawg?.playtime,
    rawg?.time_to_beat?.main,
    rawg?.time_to_beat?.main_story,
    rawg?.playtime_hours,
    rawg?.average_playtime,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
}

const fmtDate = (d) => d.toISOString().slice(0, 10);
const roundWeeks = (x) => (x == null ? null : Math.round(x * 10) / 10);

function toHoursInt(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/* ----------------------------- SQL helpers ---------------------------- */
async function fetchBaseRows(userId) {
  const sql = `
    SELECT g.id, g.name, g.status, s.rank, g.how_long_to_beat
    FROM games g
    JOIN statuses s ON s.status = g.status
    WHERE g.user_id = $1
  `;
  const { rows } = await pool.query(sql, [userId]);
  return rows;
}

/* ------------------------ HLTB / RAWG resolvers ----------------------- */
function getHLTBHours(app, title) {
  const h = lookupHLTBHoursByPref(app, title, "main");
  return Number.isFinite(h) && h > 0 ? Math.trunc(h) : null;
}

function getRawgPlaytime(app, title) {
  const entry = (app?.locals?.rawgCache || {})[lowerKey(title)];
  return getRawgHours(entry);
}

/* ----------------------- Per-row hours resolution ---------------------- */
/**
 * 1) DB hours if present
 * 2) HLTB hours -> persist later (best-effort)
 * 3) RAWG playtime (do NOT persist)
 * 4) else exclude (return null)
 */
async function resolveHoursForRow(req, row, userId) {
  const dbHours = toHoursInt(row.how_long_to_beat);
  if (dbHours > 0) return { hours: dbHours, source: "db" };

  const hltb = getHLTBHours(req.app, row.name);
  if (hltb && hltb > 0) return { hours: hltb, source: "hltb" };

  const rawg = getRawgPlaytime(req.app, row.name);
  if (rawg && rawg > 0) return { hours: rawg, source: "rawg" };

  return null; // excluded from stats
}

/* --------------------------- Aggregation core -------------------------- */
function computeAggregates(rowsWithHours, weeklyHours) {
  // Build per-status aggregates and totals
  const map = new Map();
  let sumAllHours = 0;
  let countForAvg = 0;
  let totalGamesCounted = 0;

  for (const r of rowsWithHours) {
    totalGamesCounted += 1;
    if (!map.has(r.status))
      map.set(r.status, { status: r.status, rank: r.rank, count: 0, hours: 0 });
    const m = map.get(r.status);
    m.count += 1;
    m.hours += r.hours;

    if (r.hours > 0) {
      sumAllHours += r.hours;
      countForAvg++;
    }
  }

  // Normalize status before set lookups (robust against minor variants)
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();

  const byStatus = Array.from(map.values()).sort((a, b) => a.rank - b.rank);
  const sumWhere = (pred) =>
    rowsWithHours.reduce(
      (acc, r) => (pred(norm(r.status)) ? acc + r.hours : acc),
      0
    );

  const hours_planned = sumWhere((s) => PLANNED_SET.has(s));
  const hours_playing = sumWhere((s) => PLAYING_SET.has(s));
  const hours_done = sumWhere((s) => DONE_SET.has(s));

  // >>> ETA must include everything EXCEPT Done (i.e., include Playing + Planned + Other)
  const hours_remaining = sumWhere((s) => !DONE_SET.has(s));

  // ETA: derive finish date from unrounded weeks, then round weeks for display
  let weeks = null,
    finish_date = null;
  if (hours_remaining === 0) {
    weeks = 0;
    finish_date = fmtDate(new Date());
  } else if (weeklyHours > 0) {
    const rawWeeks = hours_remaining / weeklyHours;
    const days = Math.ceil(rawWeeks * 7);
    const finish = new Date();
    finish.setDate(finish.getDate() + days);
    weeks = roundWeeks(rawWeeks);
    finish_date = fmtDate(finish);
  }

  return {
    totals: {
      count: totalGamesCounted,
      hours_planned,
      hours_playing,
      hours_done,
      hours_remaining, // still returned for compatibility (not used for the KPI rename)
      total_hours: sumAllHours, // <<< NEW: all hours across every status
      avg_hours: countForAvg ? Math.round(sumAllHours / countForAvg) : 0,
    },
    byStatus,
    eta: {
      weekly_hours: weeklyHours,
      remaining_hours: hours_remaining,
      weeks,
      finish_date,
    },
  };
}

/* --------------------------------- Route -------------------------------- */
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const weekly_hours = Math.max(
      0,
      parseInt(req.query.weekly_hours ?? DEFAULT_WEEKLY_HOURS, 10) || 0
    );
    const includeMissing =
      String(req.query.include_missing_names || "false").toLowerCase() ===
      "true";

    // Micro-cache keyed by sensible params
    const cacheKey = `wh=${weekly_hours}&missing=${includeMissing ? 1 : 0}`;
    const hit = cacheGet(userId, cacheKey);
    if (hit) return res.json(hit);

    const baseRows = await fetchBaseRows(userId);

    // Resolve hours and collect HLTB writes for a bounded batch
    const accepted = [];
    const skipped = [];
    const sources = { db: 0, hltb: 0, rawg: 0 };
    const hltbWrites = [];

    for (const r of baseRows) {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await resolveHoursForRow(req, r, userId);
      if (!resolved) {
        skipped.push(r.name);
        continue;
      }

      accepted.push({ ...r, hours: resolved.hours });
      sources[resolved.source]++;

      // (optional) persist HLTB in the background in small bursts
      if (resolved.source === "hltb") {
        hltbWrites.push({ id: r.id, hours: resolved.hours });
      }
    }

    // Flush at most N HLTB updates to de-batch writes
    if (hltbWrites.length) {
      const sql = `
        UPDATE games SET how_long_to_beat = $2
        WHERE id = $1
      `;
      const batch = hltbWrites.slice(0, 50); // cap batch size
      for (const w of batch) {
        // eslint-disable-next-line no-await-in-loop
        await pool.query(sql, [w.id, w.hours]);
      }
    }

    const agg = computeAggregates(accepted, weekly_hours);

    const payload = {
      ...agg,
      meta: {
        sources,
        missing_stats_count: skipped.length,
        ...(includeMissing ? { missing_names: skipped } : {}),
      },
      params: { weekly_hours, include_missing_names: includeMissing },
    };

    cacheSet(userId, cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

export default router;
