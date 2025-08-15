// backend/routes/insights.js
import express from "express";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheGet, cacheSet } from "../utils/microCache.js";
import { lookupHLTBHoursByPref } from "../utils/hltb.js";
import { GROUP_SETS, statusGroupOf, BUCKETS } from "../utils/status.js";

const router = express.Router();

/** ---- Status groupings (server-authoritative) ---- */
const {
  planned: PLANNED_SET,
  playing: PLAYING_SET,
  done: DONE_SET,
} = GROUP_SETS;

// Backlog semantic bucket from the server:
const BACKLOG_GROUPS = new Set(BUCKETS.backlog);

const DEFAULT_WEEKLY_HOURS = 10;

/* --------------------------- shared helpers --------------------------- */
const lowerKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

function getRawgHours(rawg) {
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

async function updateGameHoursIfEmpty(gameId, userId, hours) {
  const sql = `
    UPDATE games
       SET how_long_to_beat = $1
     WHERE id = $2
       AND user_id = $3
       AND (how_long_to_beat IS NULL OR how_long_to_beat <= 0)
  `;
  await pool.query(sql, [hours, gameId, userId]);
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

/* --------------------------- small async util -------------------------- */
async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }
  );
  await Promise.all(workers);
  return out;
}

/* ----------------------------- Aggregation ---------------------------- */
function computeAggregates(rowsWithHours, weeklyHours) {
  // status -> { status, rank, count, hours }
  const map = new Map();
  let totalGamesCounted = 0;
  let sumAllHours = 0;
  let countForAvg = 0;

  for (const r of rowsWithHours) {
    totalGamesCounted++;
    if (!map.has(r.status)) {
      map.set(r.status, { status: r.status, rank: r.rank, count: 0, hours: 0 });
    }
    const m = map.get(r.status);
    m.count += 1;
    m.hours += r.hours; // hours already int

    if (r.hours > 0) {
      sumAllHours += r.hours;
      countForAvg++;
    }
  }

  const byStatus = Array.from(map.values()).sort((a, b) => a.rank - b.rank);

  const sumWhere = (pred) =>
    rowsWithHours.reduce((acc, r) => (pred(r.status) ? acc + r.hours : acc), 0);

  // ✅ use statusGroupOf so casing/aliases never break math
  const hours_planned = sumWhere((s) => PLANNED_SET.has(s));
  const hours_playing = sumWhere((s) => PLAYING_SET.has(s));
  const hours_done = sumWhere((s) => DONE_SET.has(s));
  // Backlog = everything not done (includes planned, playing, and any “other”)
  const hours_remaining = sumWhere((s) => statusGroupOf(s) !== "done");
  // ETA
  let weeks = null;
  let finish_date = null;
  if (hours_remaining === 0) {
    weeks = 0;
    finish_date = fmtDate(new Date());
  } else if (weeklyHours > 0) {
    const rawWeeks = hours_remaining / weeklyHours;
    const days = Math.ceil(rawWeeks * 7);
    const d = new Date();
    d.setDate(d.getDate() + days);
    finish_date = fmtDate(d);
    weeks = roundWeeks(rawWeeks);
  }

  return {
    totals: {
      count: totalGamesCounted,
      hours_planned,
      hours_playing,
      hours_done,
      hours_remaining,
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

      sources[resolved.source] += 1;
      accepted.push({
        id: r.id,
        name: r.name,
        status: r.status,
        rank: r.rank,
        hours: resolved.hours,
      });

      // Only persist later if the source was HLTB and DB was empty
      if (resolved.source === "hltb") {
        hltbWrites.push({ gameId: r.id, userId, hours: resolved.hours });
      }
    }

    // Best-effort: persist HLTB hours (bounded concurrency)
    await mapWithLimit(hltbWrites, 6, ({ gameId, userId, hours }) =>
      updateGameHoursIfEmpty(gameId, userId, hours)
    );

    const { totals, byStatus, eta } = computeAggregates(accepted, weekly_hours);

    const payload = {
      totals,
      byStatus,
      eta,
      meta: {
        sources_used: sources,
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
