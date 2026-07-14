// backend/routes/insights.js
import express from "express";
import { insightsQuery } from "../validators/insights.js";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheGet, cacheSet } from "../utils/microCache.js";
import { lookupHLTBHoursByPref } from "../utils/hltb.js";
import { statusGroupOf } from "../utils/status.js";

const router = express.Router();

/* ------------------------------- Utilities ----------------------------- */
const fmtDate = (d) => d.toISOString().slice(0, 10);
const roundWeeks = (x) => (x == null ? null : Math.round(x * 10) / 10);

function toHoursInt(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; // ← round, not trunc
}

/* ----------------------------- SQL helpers ---------------------------- */
async function fetchBaseRows(userId) {
  const sql = `
    SELECT g.id,
           g.name,
           g.status,
           s.rank,
           g.how_long_to_beat,
           g.hours_preferred_source,
           cg.rawg_playtime_hours AS catalog_rawg_playtime_hours,
           ugs.playtime_minutes_forever AS steam_playtime_minutes
    FROM games g
    JOIN statuses s ON s.status = g.status
    LEFT JOIN catalog_games cg ON cg.id = g.catalog_game_id
    LEFT JOIN LATERAL (
      SELECT source.*
      FROM user_game_sources source
      WHERE source.game_id = g.id
        AND source.user_id = g.user_id
        AND source.provider = 'steam'
        AND source.source_status = 'owned'
      ORDER BY
        (source.playtime_minutes_forever IS NOT NULL AND source.playtime_minutes_forever > 0) DESC,
        source.last_synced_at DESC NULLS LAST,
        source.id DESC
      LIMIT 1
    ) ugs ON TRUE
    WHERE g.user_id = $1
  `;
  const { rows } = await pool.query(sql, [userId]);
  return rows;
}

/* ----------------------------- HLTB resolver -------------------------- */
function getHLTBHours(app, title) {
  const h = lookupHLTBHoursByPref(app, title, "main");
  return Number.isFinite(h) && h > 0 ? Math.round(h) : null; // ← round, not trunc
}

/* ----------------------- Per-row hours resolution ---------------------- */
function resolveHoursForRow(req, row) {
  const group = statusGroupOf(row.status);
  const steamMinutes = Number(row.steam_playtime_minutes);
  const steamHours =
    Number.isFinite(steamMinutes) && steamMinutes > 0
      ? Math.round((steamMinutes / 60) * 10) / 10
      : 0;
  const preferredSource = String(row.hours_preferred_source || "auto");
  if (
    steamHours > 0 &&
    (preferredSource === "steam_actual" ||
      (preferredSource === "auto" && group === "done"))
  ) {
    return { hours: steamHours, source: "steam" };
  }

  const dbHours = toHoursInt(row.how_long_to_beat);
  if (dbHours > 0) return { hours: dbHours, source: "db" };

  const hltb = getHLTBHours(req.app, row.name);
  if (hltb && hltb > 0) return { hours: hltb, source: "hltb" };

  const catalogRawg = toHoursInt(row.catalog_rawg_playtime_hours);
  if (catalogRawg > 0) return { hours: catalogRawg, source: "rawg" };

  return null; // excluded from stats
}

/* --------------------------- Aggregation core -------------------------- */
function computeAggregates(rowsWithHours, weeklyHours) {
  const map = new Map();
  let sumAllHours = 0;
  let countForAvg = 0;
  let totalGamesCounted = 0;

  // KPI groups used by tiles and for ETA remaining calc
  const groupHours = { planned: 0, playing: 0, done: 0 };

  for (const r of rowsWithHours) {
    totalGamesCounted += 1;

    if (!map.has(r.status)) {
      map.set(r.status, { status: r.status, rank: r.rank, count: 0, hours: 0 });
    }
    const m = map.get(r.status);
    m.count += 1;
    m.hours += r.hours;

    // canonical grouping (prevents UI/server drift)
    const g = statusGroupOf(r.status); // "planned" | "playing" | "done" | "other"
    if (g === "planned" || g === "playing" || g === "done") {
      groupHours[g] += r.hours;
    }

    if (r.hours > 0) {
      sumAllHours += r.hours;
      countForAvg++;
    }
  }

  const byStatus = Array.from(map.values()).sort((a, b) => a.rank - b.rank);

  const remainingHours = groupHours.planned + groupHours.playing; // exclude done
  const totalHours = byStatus.reduce((acc, x) => acc + x.hours, 0);
  const avgHours =
    countForAvg > 0 ? Math.round((sumAllHours / countForAvg) * 10) / 10 : 0;

  const etaWeeks =
    weeklyHours > 0 ? roundWeeks(remainingHours / weeklyHours) : null;
  const today = new Date();
  const etaDate =
    etaWeeks != null
      ? fmtDate(new Date(today.getTime() + etaWeeks * 7 * 86400e3))
      : null;

  return {
    totals: {
      // tiles
      count: totalGamesCounted,
      hours_playing: groupHours.playing,
      hours_planned: groupHours.planned,
      hours_done: groupHours.done,

      // existing totals
      total_hours: totalHours,
      remaining_hours: remainingHours,
      avg_hours: avgHours,
      total_games_counted: totalGamesCounted,
    },
    byStatus,
    eta: {
      // what the UI reads
      remaining_hours: remainingHours,
      weekly_hours: weeklyHours,
      weeks: etaWeeks,
      finish_date: etaDate,

      // keep old keys for backward-compat (harmless)
      eta_weeks: etaWeeks,
      eta_date: etaDate,
    },
  };
}

/* -------------------------------- Route -------------------------------- */
router.get("/", verifyToken, insightsQuery, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Params
    const weekly_hours = req.query.weekly_hours;
    const includeMissing = req.query.include_missing_names;

    // version bump to avoid stale payloads
    const cacheKey = `v5|wh=${weekly_hours}&missing=${includeMissing ? 1 : 0}`;
    const hit = cacheGet(userId, cacheKey);
    if (hit) return res.json(hit);

    const baseRows = await fetchBaseRows(userId);

    const accepted = [];
    const skipped = [];
    const sources = { db: 0, hltb: 0, rawg: 0, steam: 0 };

    for (const r of baseRows) {
      const resolved = resolveHoursForRow(req, r);
      if (!resolved) {
        skipped.push(r.name);
        continue;
      }

      accepted.push({ ...r, hours: resolved.hours });
      sources[resolved.source]++;

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
