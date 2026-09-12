import express from "express";
import { insightsQuery } from "../validators/insights.js";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheGet, cacheSet } from "../utils/microCache.js";
import { lookupHLTBHoursByPref } from "../utils/hltb.js";
import { statusGroupOf } from "../utils/status.js";

const router = express.Router();

function toHours(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 10) / 10 : null;
}

function names(value) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map((item) => typeof item === "string" ? item : item?.name)
    .map((item) => String(item || "").trim()).filter(Boolean))];
}

async function fetchRows(userId) {
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.status, s.rank, g.how_long_to_beat,
       g.hours_preferred_source, g.my_score, g.started_at, g.finished_at,
       cg.rawg_playtime_hours AS catalog_rawg_playtime_hours, cg.genres_json AS rawg_genres,
       personal.personal_genres, steam.playtime_minutes_forever AS steam_playtime_minutes
     FROM games g
     JOIN statuses s ON s.status = g.status
     LEFT JOIN catalog_games cg ON cg.id = g.catalog_game_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(jsonb_agg(jsonb_build_object('name', genre.name) ORDER BY genre.name), '[]'::jsonb) AS personal_genres
       FROM game_personal_genres link
       JOIN user_personal_genres genre ON genre.id = link.personal_genre_id AND genre.user_id = link.user_id
       WHERE link.game_id = g.id AND link.user_id = g.user_id
     ) personal ON TRUE
     LEFT JOIN LATERAL (
       SELECT source.playtime_minutes_forever
       FROM user_game_sources source
       WHERE source.game_id = g.id AND source.user_id = g.user_id
         AND source.provider = 'steam' AND source.source_status = 'owned'
       ORDER BY (source.playtime_minutes_forever > 0) DESC, source.last_synced_at DESC NULLS LAST, source.id DESC
       LIMIT 1
     ) steam ON TRUE
     WHERE g.user_id = $1 AND LOWER(TRIM(g.status)) <> 'wishlist'`,
    [userId],
  );
  return rows;
}

function resolveHours(app, row) {
  const steamHours = toHours(Number(row.steam_playtime_minutes) / 60);
  const preferred = String(row.hours_preferred_source || "auto");
  if (steamHours && (preferred === "steam_actual" || (preferred === "auto" && statusGroupOf(row.status) === "done"))) {
    return { hours: steamHours, source: "steam" };
  }
  const saved = toHours(row.how_long_to_beat);
  if (saved) return { hours: saved, source: "saved" };
  const hltb = toHours(lookupHLTBHoursByPref(app, row.name, "main"));
  if (hltb) return { hours: hltb, source: "hltb" };
  const rawg = toHours(row.catalog_rawg_playtime_hours);
  if (rawg) return { hours: rawg, source: "rawg" };
  return { hours: null, source: null };
}

export function buildInsightsPayload(rows, app, selectedYear = null) {
  const sources = { saved: 0, hltb: 0, rawg: 0, steam: 0 };
  const games = rows.map((row) => {
    const resolved = resolveHours(app, row);
    if (resolved.source) sources[resolved.source] += 1;
    return {
      id: Number(row.id), name: row.name, status: row.status, rank: Number(row.rank),
      score: row.my_score == null ? null : Number(row.my_score),
      startedAt: row.started_at || null, finishedAt: row.finished_at || null,
      personalGenres: names(row.personal_genres), rawgGenres: names(row.rawg_genres),
      hours: resolved.hours, hoursSource: resolved.source,
    };
  });
  const yearly = new Map();
  const bump = (date, key) => {
    const match = String(date || "").match(/^(\d{4})-\d{2}-\d{2}$/);
    if (!match) return;
    const year = Number(match[1]);
    const value = yearly.get(year) || { year, started: 0, finished: 0 };
    value[key] += 1;
    yearly.set(year, value);
  };
  games.forEach((game) => { bump(game.startedAt, "started"); bump(game.finishedAt, "finished"); });
  const focusedGames = selectedYear
    ? games.filter((game) => String(game.startedAt || "").startsWith(`${selectedYear}-`) || String(game.finishedAt || "").startsWith(`${selectedYear}-`))
    : games;
  const byStatus = new Map();
  games.forEach((game) => {
    const current = byStatus.get(game.status) || { status: game.status, rank: game.rank, count: 0, estimatedHours: 0, estimatedGames: 0 };
    current.count += 1;
    if (game.hours != null) { current.estimatedHours += game.hours; current.estimatedGames += 1; }
    byStatus.set(game.status, current);
  });
  const scores = Array.from({ length: 21 }, (_, index) => ({ score: index / 2, count: 0 }));
  focusedGames.forEach((game) => {
    if (Number.isFinite(game.score) && game.score >= 0 && game.score <= 10) {
      scores[Math.round(game.score * 2)].count += 1;
    }
  });
  const rated = focusedGames.filter((game) => game.score != null);
  const startedUnfinished = games.filter((game) => game.startedAt && !game.finishedAt);
  return {
    params: { year: selectedYear }, games,
    totals: {
      games: games.length, estimatedGames: games.filter((game) => game.hours != null).length,
      missingEstimates: games.filter((game) => game.hours == null).length,
      finished: games.filter((game) => statusGroupOf(game.status) === "done").length,
      playing: games.filter((game) => statusGroupOf(game.status) === "playing").length,
      startedUnfinished: startedUnfinished.length,
    },
    coverage: { sources },
    byStatus: [...byStatus.values()].sort((a, b) => a.rank - b.rank),
    yearly: [...yearly.values()].sort((a, b) => a.year - b.year),
    focused: {
      year: selectedYear, games: focusedGames.length,
      started: selectedYear ? focusedGames.filter((game) => String(game.startedAt || "").startsWith(`${selectedYear}-`)).length : games.filter((game) => game.startedAt).length,
      finished: selectedYear ? focusedGames.filter((game) => String(game.finishedAt || "").startsWith(`${selectedYear}-`)).length : games.filter((game) => game.finishedAt).length,
      rated: rated.length,
      averageScore: rated.length ? Math.round((rated.reduce((sum, game) => sum + game.score, 0) / rated.length) * 10) / 10 : null,
      scores,
    },
  };
}

async function fetchWishlistCount(userId) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM user_wishlist_items WHERE user_id = $1 AND local_intent_active = TRUE",
    [userId],
  );
  return Number(rows[0]?.count) || 0;
}

router.get("/", verifyToken, insightsQuery, async (req, res, next) => {
  try {
    const year = req.query.year ?? null;
    const cacheKey = `v6|year=${year || "all"}`;
    const cached = cacheGet(req.user.id, cacheKey);
    if (cached) return res.json(cached);
    const [rows, wishlistCount] = await Promise.all([
      fetchRows(req.user.id),
      fetchWishlistCount(req.user.id),
    ]);
    const payload = buildInsightsPayload(rows, req.app, year);
    payload.totals.wishlist = wishlistCount;
    cacheSet(req.user.id, cacheKey, payload);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

export default router;
