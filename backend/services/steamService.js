import jwt from "jsonwebtoken";
import stringSimilarity from "string-similarity";
import { pool } from "../db.js";
import { normalizeGameTitle } from "../utils/gameTitle.js";
import { badRequest, serviceUnavailable } from "../utils/httpError.js";
import { normStatus } from "../utils/status.js";
import { searchCatalog } from "./catalogService.js";

const PROVIDER = "steam";
const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_API_BASE = "https://api.steampowered.com";
const STEAM_MEDIA_BASE = "https://media.steampowered.com/steamcommunity/public/images/apps";
const SYNC_COOLDOWN_MS = 15 * 60 * 1000;
const ACHIEVEMENT_SYNC_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CANDIDATE_LIMIT = 100;
const MAX_CANDIDATE_LIMIT = 250;
const AUTO_MATCH_LIMIT = 250;
const SYNC_AUTO_MATCH_LIMIT = 150;
const BULK_SCOPE_LIMIT = 1000;
const ACHIEVEMENT_BATCH_LIMIT = 250;
const ACHIEVEMENT_BATCH_CONCURRENCY = 3;
const DUPLICATE_TITLE_SCORE = 0.86;
const RECENT_STEAM_ACTIVITY_DAYS = 14;
const DEV_OWNED_GAMES_SAMPLE = {
  response: {
    games: [
      {
        appid: 1086940,
        name: "Baldurs Gate 3",
        playtime_forever: 4200,
      },
      {
        appid: 1145360,
        name: "Hades",
        playtime_forever: 615,
      },
      {
        appid: 999999,
        name: "Totally Unknown Test Game",
        playtime_forever: 0,
      },
      {
        appid: 123456,
        name: "Some DLC Soundtrack",
        playtime_forever: 0,
      },
    ],
  },
};

function nowIso() {
  return new Date().toISOString();
}

function appBaseUrl() {
  return (
    process.env.STEAM_OPENID_REALM ||
    process.env.APP_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    `http://localhost:${process.env.PORT || 5000}`
  ).replace(/\/+$/, "");
}

function steamReturnUrl() {
  return (
    process.env.STEAM_OPENID_RETURN_URL ||
    `${appBaseUrl()}/api/steam/auth/callback`
  );
}

function frontendSteamUrl(params = {}) {
  const base = (
    process.env.FRONTEND_BASE_URL ||
    process.env.VITE_FRONTEND_BASE_URL ||
    process.env.STEAM_FRONTEND_RETURN_URL ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");
  const url = new URL("/steam/import", base);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export function createSteamOpenIdUrl(userId) {
  const state = jwt.sign(
    { sub: Number(userId), provider: PROVIDER, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
  const returnTo = new URL(steamReturnUrl());
  returnTo.searchParams.set("state", state);

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo.toString(),
    "openid.realm": appBaseUrl(),
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  return STEAM_OPENID_ENDPOINT + "?" + params.toString();
}

export function verifySteamState(state) {
  const decoded = jwt.verify(String(state || ""), process.env.JWT_SECRET);
  if (decoded?.provider !== PROVIDER || !decoded?.sub) {
    throw badRequest("Invalid Steam link state.");
  }
  return Number(decoded.sub);
}

export async function verifySteamOpenId(query) {
  if (query?.["openid.mode"] !== "id_res") {
    throw badRequest("Steam did not return a valid OpenID response.");
  }

  const claimed = String(query?.["openid.claimed_id"] || "");
  const match = claimed.match(/\/id\/(\d+)$/);
  if (!match) throw badRequest("Steam response did not include a SteamID.");

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (key.startsWith("openid.") && key !== "openid.mode") {
      params.set(key, String(value));
    }
  }
  params.set("openid.mode", "check_authentication");

  const res = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const text = await res.text();
  if (!res.ok || !text.includes("is_valid:true")) {
    throw badRequest("Steam OpenID verification failed.");
  }

  return match[1];
}

function steamApiKey() {
  return process.env.STEAM_WEB_API_KEY || "";
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function envFlag(name) {
  return String(process.env[name] || "").toLowerCase() === "true";
}

function requireSteamApiKey() {
  const key = steamApiKey();
  if (!key) {
    throw serviceUnavailable("Steam API key is not configured.");
  }
  return key;
}

async function steamGet(path, params = {}) {
  const url = new URL(path, STEAM_API_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const err = serviceUnavailable("Steam is temporarily unavailable.");
    err.code = "steam_unavailable";
    throw err;
  }
  return res.json();
}

export function normalizeOwnedGamesPayload(payload) {
  const response = payload?.response || payload || {};
  const games = Array.isArray(response.games) ? response.games : [];
  return games
    .map((game) => {
      const appid = String(game?.appid || "").trim();
      if (!appid) return null;
      const iconHash = game.img_icon_url || "";
      return {
        appid,
        name: String(game.name || "").trim() || `Steam App ${appid}`,
        iconUrl: iconHash ? `${STEAM_MEDIA_BASE}/${appid}/${iconHash}.jpg` : null,
        playtimeMinutes: Number.isFinite(Number(game.playtime_forever))
          ? Math.max(0, Math.trunc(Number(game.playtime_forever)))
          : null,
        lastPlayedAt: Number(game.rtime_last_played)
          ? new Date(Number(game.rtime_last_played) * 1000).toISOString()
          : null,
      };
    })
    .filter(Boolean);
}

export async function fetchOwnedSteamGames(steamId) {
  if (!isProduction() && process.env.STEAM_MOCK_OWNED_GAMES_JSON) {
    return normalizeOwnedGamesPayload(JSON.parse(process.env.STEAM_MOCK_OWNED_GAMES_JSON));
  }
  if (!isProduction() && envFlag("STEAM_DEV_SYNC_SAMPLE") && !steamApiKey()) {
    return normalizeOwnedGamesPayload(DEV_OWNED_GAMES_SAMPLE);
  }
  const key = requireSteamApiKey();
  const payload = await steamGet("/IPlayerService/GetOwnedGames/v0001/", {
    key,
    steamid: steamId,
    include_appinfo: 1,
    include_played_free_games: 1,
    format: "json",
  });
  return normalizeOwnedGamesPayload(payload);
}

export async function fetchPlayerSummary(steamId) {
  if (!isProduction() && process.env.STEAM_MOCK_PLAYER_SUMMARY_JSON) {
    return JSON.parse(process.env.STEAM_MOCK_PLAYER_SUMMARY_JSON);
  }
  const key = requireSteamApiKey();
  const payload = await steamGet("/ISteamUser/GetPlayerSummaries/v0002/", {
    key,
    steamids: steamId,
    format: "json",
  });
  const player = payload?.response?.players?.[0] || {};
  return {
    displayName: player.personaname || null,
    profileUrl: player.profileurl || null,
    avatarUrl: player.avatarfull || player.avatarmedium || player.avatar || null,
    visibilityState:
      player.communityvisibilitystate == null
        ? null
        : Number(player.communityvisibilitystate),
  };
}

export async function fetchSteamPlayerAchievements(steamId, appId) {
  const key = requireSteamApiKey();
  return steamGet("/ISteamUserStats/GetPlayerAchievements/v0001/", {
    key,
    steamid: steamId,
    appid: appId,
    l: "english",
    format: "json",
  });
}

export async function fetchSteamAchievementSchema(appId) {
  const key = requireSteamApiKey();
  return steamGet("/ISteamUserStats/GetSchemaForGame/v2/", {
    key,
    appid: appId,
    l: "english",
    format: "json",
  });
}

function achievementCountFromSchema(payload) {
  const achievements = payload?.game?.availableGameStats?.achievements;
  return Array.isArray(achievements) ? achievements.length : null;
}

function playerAchievementRows(payload) {
  const stats = payload?.playerstats;
  if (!stats || stats.success === false) return null;
  const achievements = stats.achievements;
  return Array.isArray(achievements) ? achievements : null;
}

export function normalizeSteamAchievementSummary(playerPayload, schemaPayload) {
  const schemaTotal = achievementCountFromSchema(schemaPayload);
  const playerRows = playerAchievementRows(playerPayload);
  const playerUnavailable =
    !!playerPayload &&
    (playerPayload?.playerstats?.success === false || playerPayload?.playerstats?.error);

  if (schemaTotal === 0) {
    return {
      status: "none",
      unlocked: 0,
      total: 0,
      percent: null,
      errorCode: null,
      errorMessage: null,
    };
  }

  if (!playerRows) {
    if (playerUnavailable && Number.isInteger(schemaTotal) && schemaTotal > 0) {
      return {
        status: "private",
        unlocked: null,
        total: schemaTotal,
        percent: null,
        errorCode: "steam_achievements_private",
        errorMessage: "Steam did not return player achievement data for this game.",
      };
    }
    if (Number.isInteger(schemaTotal) && schemaTotal > 0) {
      return {
        status: "unavailable",
        unlocked: null,
        total: schemaTotal,
        percent: null,
        errorCode: "steam_achievements_unavailable",
        errorMessage: "Steam did not return achievement progress for this game.",
      };
    }
    return {
      status: "unavailable",
      unlocked: null,
      total: null,
      percent: null,
      errorCode: "steam_achievements_unavailable",
      errorMessage: "Steam did not return achievement data for this game.",
    };
  }

  const total = Number.isInteger(schemaTotal) ? schemaTotal : playerRows.length;
  if (total <= 0) {
    return {
      status: "none",
      unlocked: 0,
      total: 0,
      percent: null,
      errorCode: null,
      errorMessage: null,
    };
  }

  const unlocked = playerRows.reduce(
    (sum, achievement) => sum + (Number(achievement?.achieved) > 0 ? 1 : 0),
    0
  );
  const percent = Math.round((Math.min(unlocked, total) / total) * 10000) / 100;
  return {
    status: "synced",
    unlocked: Math.min(unlocked, total),
    total,
    percent,
    errorCode: null,
    errorMessage: null,
  };
}

export async function upsertSteamAccount(userId, steamId, summary = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      UPDATE user_external_accounts
         SET sync_status = 'disconnected',
             disconnected_at = NOW(),
             updated_at = NOW()
       WHERE provider = 'steam'
         AND provider_user_id = $1
         AND user_id <> $2
         AND disconnected_at IS NULL
      `,
      [String(steamId), userId]
    );
    const { rows } = await client.query(
      `
      INSERT INTO user_external_accounts (
        user_id, provider, provider_user_id, display_name, profile_url, avatar_url,
        visibility_state, sync_status, last_profile_sync_at, disconnected_at,
        last_error_code, last_error_message, updated_at
      )
      VALUES ($1, 'steam', $2, $3, $4, $5, $6, 'linked', NOW(), NULL, NULL, NULL, NOW())
      ON CONFLICT (user_id, provider) WHERE disconnected_at IS NULL
      DO UPDATE SET
        provider_user_id = EXCLUDED.provider_user_id,
        display_name = EXCLUDED.display_name,
        profile_url = EXCLUDED.profile_url,
        avatar_url = EXCLUDED.avatar_url,
        visibility_state = EXCLUDED.visibility_state,
        sync_status = 'linked',
        last_profile_sync_at = NOW(),
        disconnected_at = NULL,
        last_error_code = NULL,
        last_error_message = NULL,
        updated_at = NOW()
      RETURNING *
      `,
      [
        userId,
        String(steamId),
        summary.displayName || null,
        summary.profileUrl || null,
        summary.avatarUrl || null,
        summary.visibilityState ?? null,
      ]
    );
    await client.query("COMMIT");
    return rows[0] || null;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function getSteamAccount(userId) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM user_external_accounts
    WHERE user_id = $1 AND provider = 'steam' AND disconnected_at IS NULL
    LIMIT 1
    `,
    [userId]
  );
  return rows[0] || null;
}

function serializeAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    steamId: row.provider_user_id,
    displayName: row.display_name,
    profileUrl: row.profile_url,
    avatarUrl: row.avatar_url,
    visibilityState: row.visibility_state,
    syncStatus: row.sync_status,
    lastProfileSyncAt: row.last_profile_sync_at,
    lastLibrarySyncAt: row.last_library_sync_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    linkedAt: row.linked_at,
  };
}

export async function getSteamAccountPayload(userId) {
  return { account: serializeAccount(await getSteamAccount(userId)) };
}

export async function disconnectSteamAccount(userId) {
  await pool.query(
    `
    UPDATE user_external_accounts
       SET sync_status = 'disconnected',
           disconnected_at = NOW(),
           updated_at = NOW()
     WHERE user_id = $1 AND provider = 'steam' AND disconnected_at IS NULL
    `,
    [userId]
  );
  await pool.query(
    `
    UPDATE user_game_sources
       SET source_status = 'disconnected',
           game_id = NULL,
           updated_at = NOW()
     WHERE user_id = $1 AND provider = 'steam'
    `,
    [userId]
  );
  return { account: null };
}

function serializeAchievementSummary(row) {
  const unlocked =
    row?.achievements_unlocked == null ? null : Number(row.achievements_unlocked);
  const total = row?.achievements_total == null ? null : Number(row.achievements_total);
  const percent =
    row?.achievements_percent == null ? null : Number(row.achievements_percent);
  return {
    status: row?.achievements_status || "unknown",
    unlocked: Number.isFinite(unlocked) ? unlocked : null,
    total: Number.isFinite(total) ? total : null,
    percent: Number.isFinite(percent) ? percent : null,
    lastSyncedAt: row?.achievements_last_synced_at || null,
    errorCode: row?.achievements_last_error_code || null,
    errorMessage: row?.achievements_last_error_message || null,
  };
}

async function selectSteamAchievementSource(userId, gameId) {
  const { rows } = await pool.query(
    `
    SELECT ugs.*, account.provider_user_id AS steam_user_id
    FROM user_game_sources ugs
    JOIN user_external_accounts account
      ON account.user_id = ugs.user_id
     AND account.provider = 'steam'
     AND account.disconnected_at IS NULL
    WHERE ugs.user_id = $1
      AND ugs.game_id = $2
      AND ugs.provider = 'steam'
      AND ugs.source_status = 'owned'
    ORDER BY
      (ugs.playtime_minutes_forever IS NOT NULL AND ugs.playtime_minutes_forever > 0) DESC,
      ugs.last_synced_at DESC NULLS LAST,
      ugs.id DESC
    LIMIT 1
    `,
    [userId, gameId]
  );
  return rows[0] || null;
}

async function selectSteamAchievementSourceById(userId, sourceId) {
  const { rows } = await pool.query(
    `
    SELECT ugs.*, account.provider_user_id AS steam_user_id
    FROM user_game_sources ugs
    JOIN user_external_accounts account
      ON account.user_id = ugs.user_id
     AND account.provider = 'steam'
     AND account.disconnected_at IS NULL
    WHERE ugs.user_id = $1
      AND ugs.id = $2
      AND ugs.provider = 'steam'
      AND ugs.source_status = 'owned'
      AND ugs.game_id IS NOT NULL
    LIMIT 1
    `,
    [userId, sourceId]
  );
  return rows[0] || null;
}

function achievementSyncCoolingDown(source, force) {
  if (force || !source?.achievements_last_synced_at) return false;
  const elapsed = Date.now() - new Date(source.achievements_last_synced_at).getTime();
  return Number.isFinite(elapsed) && elapsed < ACHIEVEMENT_SYNC_COOLDOWN_MS;
}

async function saveAchievementSummary(sourceId, summary) {
  const { rows } = await pool.query(
    `
    UPDATE user_game_sources
       SET achievements_unlocked = $2,
           achievements_total = $3,
           achievements_percent = $4,
           achievements_status = $5,
           achievements_last_synced_at = NOW(),
           achievements_last_error_code = $6,
           achievements_last_error_message = $7,
           updated_at = NOW()
     WHERE id = $1
     RETURNING *
    `,
    [
      sourceId,
      summary.unlocked,
      summary.total,
      summary.percent,
      summary.status,
      summary.errorCode,
      summary.errorMessage,
    ]
  );
  return rows[0];
}

async function saveAchievementFailure(sourceId, err) {
  const { rows } = await pool.query(
    `
    UPDATE user_game_sources
       SET achievements_status = 'failed',
           achievements_last_synced_at = NOW(),
           achievements_last_error_code = $2,
           achievements_last_error_message = $3,
           updated_at = NOW()
     WHERE id = $1
     RETURNING *
    `,
    [
      sourceId,
      err?.code || "steam_achievements_failed",
      err?.message || "Could not sync Steam achievements.",
    ]
  );
  return rows[0];
}

async function syncSteamAchievementSource(source, { force = false } = {}) {
  if (achievementSyncCoolingDown(source, force)) {
    return {
      skipped: true,
      reason: "cooldown",
      gameId: source.game_id,
      steamAppId: source.provider_app_id,
      achievements: serializeAchievementSummary(source),
      cooldownSeconds: Math.ceil(
        (ACHIEVEMENT_SYNC_COOLDOWN_MS -
          (Date.now() - new Date(source.achievements_last_synced_at).getTime())) /
          1000
      ),
    };
  }

  try {
    const [playerResult, schemaResult] = await Promise.allSettled([
      fetchSteamPlayerAchievements(source.steam_user_id, source.provider_app_id),
      fetchSteamAchievementSchema(source.provider_app_id),
    ]);
    if (playerResult.status === "rejected" && schemaResult.status === "rejected") {
      throw playerResult.reason || schemaResult.reason;
    }
    const schemaPayload = schemaResult.status === "fulfilled" ? schemaResult.value : null;
    const playerPayload =
      playerResult.status === "fulfilled"
        ? playerResult.value
        : {
            playerstats: {
              success: false,
              error:
                playerResult.reason?.message ||
                "Steam did not return player achievement data for this game.",
            },
          };
    const summary = normalizeSteamAchievementSummary(playerPayload, schemaPayload);
    const updated = await saveAchievementSummary(source.id, summary);
    return {
      skipped: false,
      status: summary.status,
      gameId: updated.game_id,
      steamAppId: updated.provider_app_id,
      achievements: serializeAchievementSummary(updated),
    };
  } catch (err) {
    const updated = await saveAchievementFailure(source.id, err);
    return {
      skipped: false,
      failed: true,
      status: "failed",
      gameId: updated.game_id,
      steamAppId: updated.provider_app_id,
      achievements: serializeAchievementSummary(updated),
    };
  }
}

export async function syncSteamAchievementsForGame(userId, gameId, { force = false } = {}) {
  const id = Number(gameId);
  if (!Number.isInteger(id)) throw badRequest("Invalid game id.");
  const source = await selectSteamAchievementSource(userId, id);
  if (!source) throw badRequest("Link this game to Steam before syncing achievements.");
  return syncSteamAchievementSource(source, { force });
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index++;
      out[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return out;
}

export function summarizeAchievementSyncResults(results = []) {
  const statusCounts = {
    synced: 0,
    none: 0,
    private: 0,
    unavailable: 0,
    failed: 0,
    skipped: 0,
  };
  for (const result of results) {
    if (result?.skipped) {
      statusCounts.skipped += 1;
      continue;
    }
    const status = result?.achievements?.status || result?.status || "failed";
    if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
      statusCounts[status] += 1;
    } else {
      statusCounts.failed += 1;
    }
  }
  return {
    synced: statusCounts.synced,
    none: statusCounts.none,
    private: statusCounts.private,
    failed: statusCounts.failed,
    skipped: statusCounts.skipped,
    unavailable: statusCounts.private + statusCounts.unavailable,
    statusCounts,
  };
}

export async function syncSteamAchievementsForLinkedGames(
  userId,
  { force = false, limit = ACHIEVEMENT_BATCH_LIMIT } = {}
) {
  const safeLimit = Math.min(
    Math.max(Number(limit) || ACHIEVEMENT_BATCH_LIMIT, 1),
    ACHIEVEMENT_BATCH_LIMIT
  );
  const account = await getSteamAccount(userId);
  if (!account) throw badRequest("Link Steam before syncing achievements.");
  const { rows } = await pool.query(
    `
    SELECT id
    FROM user_game_sources
    WHERE user_id = $1
      AND provider = 'steam'
      AND source_status = 'owned'
      AND game_id IS NOT NULL
    ORDER BY
      achievements_last_synced_at NULLS FIRST,
      last_played_at DESC NULLS LAST,
      id
    LIMIT $2
    `,
    [userId, safeLimit]
  );
  const sources = [];
  for (const row of rows) {
    const source = await selectSteamAchievementSourceById(userId, row.id);
    if (source) sources.push(source);
  }
  const results = await mapWithConcurrency(
    sources,
    ACHIEVEMENT_BATCH_CONCURRENCY,
    (source) => syncSteamAchievementSource(source, { force })
  );
  const summary = summarizeAchievementSyncResults(results);
  return {
    total: sources.length,
    ...summary,
    results,
    syncedAt: nowIso(),
  };
}

const STEAM_FILTER_PATTERNS = [
  {
    reason: "steam_dlc",
    patterns: [
      /\bdlc\b/,
      /\bexpansion pass\b/,
      /\bseason pass\b/,
      /\bdeluxe pack\b/,
      /\bupgrade pack\b/,
      /\bcharacter pack\b/,
      /\bcostume pack\b/,
      /\bskin pack\b/,
      /\bcontent pack\b/,
      /\bmap pack\b/,
      /\bepisode pass\b/,
    ],
  },
  {
    reason: "steam_demo",
    patterns: [
      /\bdemo\b/,
      /\btrial\b/,
      /\bprologue\b/,
      /\bpreview\b/,
    ],
  },
  {
    reason: "steam_playtest",
    patterns: [
      /\bplaytest\b/,
      /\bbeta\b/,
      /\bpublic test\b/,
      /\btest server\b/,
      /\btechnical test\b/,
      /\bclosed alpha\b/,
      /\bopen alpha\b/,
      /\bclosed beta\b/,
      /\bopen beta\b/,
      /\bpts\b/,
    ],
  },
  {
    reason: "steam_server",
    patterns: [
      /\bdedicated server\b/,
      /\bserver\b/,
    ],
  },
  {
    reason: "steam_soundtrack",
    patterns: [
      /\bost\b/,
      /\bsoundtrack\b/,
      /\boriginal soundtrack\b/,
      /\bmusic pack\b/,
    ],
  },
  {
    reason: "steam_tool",
    patterns: [
      /\bbenchmark\b/,
      /\beditor\b/,
      /\blevel editor\b/,
      /\bmod tools?\b/,
      /\bsdk\b/,
      /\bsoftware\b/,
      /\btool\b/,
      /\btools\b/,
      /\butility\b/,
      /\bworkshop tools?\b/,
    ],
  },
  {
    reason: "steam_bonus_content",
    patterns: [
      /\bartbook\b/,
      /\bbonus content\b/,
      /\bcomic\b/,
      /\bcommentary\b/,
      /\bcostume\b/,
      /\bfan kit\b/,
      /\bmanual\b/,
      /\bpress kit\b/,
      /\btexture pack\b/,
      /\bhigh resolution texture pack\b/,
      /\bwallpaper\b/,
    ],
  },
  {
    reason: "steam_media",
    patterns: [
      /\btrailer\b/,
      /\bmovie\b/,
      /\bvideo\b/,
      /\bmaking of\b/,
      /\bdocumentary\b/,
    ],
  },
];

export function likelyFilteredReason(name) {
  const value = normalizeGameTitle(name);
  if (!value) return "missing_title";
  const match = STEAM_FILTER_PATTERNS.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(value))
  );
  return match?.reason || null;
}

function replaceWholeWord(value, from, to) {
  return value.replace(new RegExp(`\\b${from}\\b`, "g"), to).replace(/\s+/g, " ").trim();
}

function romanNumeralVariants(value) {
  const pairs = [
    ["10", "x"],
    ["9", "ix"],
    ["8", "viii"],
    ["7", "vii"],
    ["6", "vi"],
    ["5", "v"],
    ["4", "iv"],
    ["3", "iii"],
    ["2", "ii"],
  ];
  const variants = new Set();
  for (const [number, roman] of pairs) {
    if (new RegExp(`\\b${roman}\\b`).test(value)) {
      variants.add(replaceWholeWord(value, roman, number));
    }
    if (new RegExp(`\\b${number}\\b`).test(value)) {
      variants.add(replaceWholeWord(value, number, roman));
    }
  }
  return variants;
}

const NUMBERED_TITLE_TOKEN = /^(?:\d+|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;

function titleTokens(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean);
}

export function titleVariants(title) {
  const base = normalizeGameTitle(title);
  if (!base) return [];
  const suffixes = [
    "anniversary edition",
    "bonus content",
    "collector s edition",
    "collectors edition",
    "complete edition",
    "definitive edition",
    "definitive experience",
    "demo",
    "deluxe edition",
    "digital deluxe edition",
    "director s cut",
    "directors cut",
    "enhanced edition",
    "expanded edition",
    "game of the year edition",
    "game of the yorha edition",
    "final cut",
    "game of the year",
    "gold edition",
    "goty edition",
    "hd edition",
    "legendary edition",
    "limited edition",
    "premium edition",
    "pc edition",
    "remaster",
    "remastered",
    "redux",
    "soundtrack",
    "special edition",
    "standard edition",
    "steam edition",
    "ultimate edition",
    "upgrade",
    "vr edition",
    "windows edition",
  ];
  const variants = new Set([base]);
  let stripped = base;
  for (const suffix of suffixes) {
    stripped = stripped.replace(new RegExp(`\\b${suffix}\\b`, "g"), " ");
  }
  stripped = stripped.replace(/\s+/g, " ").trim();
  if (stripped) variants.add(stripped);
  for (const variant of [...variants]) {
    for (const romanVariant of romanNumeralVariants(variant)) {
      variants.add(romanVariant);
    }
  }
  return [...variants];
}

function isNumberedSequelPair(title, candidateTitle) {
  const variants = titleVariants(title);
  const candidateVariants = titleVariants(candidateTitle);
  for (const variant of variants) {
    for (const candidate of candidateVariants) {
      const left = titleTokens(variant);
      const right = titleTokens(candidate);
      if (Math.abs(left.length - right.length) !== 1) continue;

      const shorter = left.length < right.length ? left : right;
      const longer = left.length > right.length ? left : right;
      const shorterHasNumber = shorter.some((token) => NUMBERED_TITLE_TOKEN.test(token));
      const longerEndsWithNumber = NUMBERED_TITLE_TOKEN.test(longer[longer.length - 1] || "");
      if (
        !shorterHasNumber &&
        longerEndsWithNumber &&
        shorter.every((token, index) => token === longer[index])
      ) {
        return true;
      }
    }
  }
  return false;
}

export function bestTitleSimilarity(title, candidateTitle) {
  const variants = titleVariants(title);
  const candidateVariants = titleVariants(candidateTitle);
  let best = 0;
  for (const variant of variants) {
    for (const candidate of candidateVariants) {
      const rating = stringSimilarity.compareTwoStrings(variant, candidate);
      const shorter = variant.length <= candidate.length ? variant : candidate;
      const longer = variant.length > candidate.length ? variant : candidate;
      const shorterWordCount = shorter.split(" ").filter(Boolean).length;
      const containsBoost =
        shorterWordCount >= 2 && shorter.length >= 8 && longer.includes(shorter)
          ? Math.max(0.9, Math.min(0.94, shorter.length / longer.length + 0.18))
          : 0;
      best = Math.max(best, rating, containsBoost);
    }
  }
  return best;
}

export function isLikelySteamDuplicateTitle(steamTitle, backlogTitle) {
  if (isNumberedSequelPair(steamTitle, backlogTitle)) return false;
  return bestTitleSimilarity(steamTitle, backlogTitle) >= DUPLICATE_TITLE_SCORE;
}

function recommendStatus(app, catalog = null, filteredReason = null) {
  if (filteredReason) {
    return {
      status: null,
      confidence: "low",
      reason: "Likely DLC, soundtrack, tool, demo, or another non-backlog app.",
    };
  }

  const minutes = Number(app?.playtimeMinutes);
  const hours = Number.isFinite(minutes) && minutes > 0 ? minutes / 60 : 0;
  const lastPlayed = app?.lastPlayedAt ? new Date(app.lastPlayedAt).getTime() : 0;
  const recentlyPlayed =
    Number.isFinite(lastPlayed) &&
    Date.now() - lastPlayed <= RECENT_STEAM_ACTIVITY_DAYS * 24 * 60 * 60 * 1000;
  const estimate = Number(catalog?.rawg_playtime_hours || 0);

  if (hours <= 0) {
    return {
      status: "plan to play",
      confidence: "medium",
      reason: "Owned on Steam with no recorded playtime.",
    };
  }

  if (recentlyPlayed) {
    return {
      status: "playing",
      confidence: "medium",
      reason: "Steam shows recent playtime.",
    };
  }

  if (hours < 2) {
    return {
      status: "played a bit",
      confidence: "high",
      reason: "Steam playtime is under 2 hours.",
    };
  }

  if (estimate >= 3 && hours >= estimate * 1.1) {
    return {
      status: "finished",
      confidence: "low",
      reason: `Steam playtime is above the ${Math.round(estimate)}h catalog estimate.`,
    };
  }

  if (hours >= 10) {
    return {
      status: "played alot but didnt finish",
      confidence: "medium",
      reason: "Steam playtime is substantial, but there is no finish signal.",
    };
  }

  return {
    status: "played and should come back",
    confidence: "low",
    reason: "Steam playtime is meaningful but not high enough to infer completion.",
  };
}

function reviewGroupForCandidate(row) {
  if (row.filtered_reason) return "filtered";
  if (row.duplicate_game_id) return "duplicates";
  if (!row.proposed_catalog_game_id && !row.user_selected_catalog_game_id) return "needs_match";
  if (row.first_play_observed_at) return "newly_played";
  const status =
    row.selected_status ||
    row.suggested_status ||
    recommendStatus(
      {
        name: row.steam_name,
        playtimeMinutes: row.playtime_minutes_forever,
        lastPlayedAt: row.last_played_at,
      },
      null,
      row.filtered_reason
    ).status;
  if (status === "plan to play") return "unplayed";
  if (status === "played a bit") return "played_bit";
  if (status === "playing") return "playing";
  if (status === "finished") return "likely_finished";
  if (status === "played alot but didnt finish") return "played_alot";
  return "matched";
}

function appendImportGroupWhere(where, group) {
  if (group === "matched") {
    where.push("(c.proposed_catalog_game_id IS NOT NULL OR c.user_selected_catalog_game_id IS NOT NULL)");
    where.push("c.duplicate_game_id IS NULL");
    where.push("c.filtered_reason IS NULL");
    where.push("ugs.first_play_observed_at IS NULL");
    where.push(
      "(COALESCE(c.selected_status, c.suggested_status) IS NULL OR COALESCE(c.selected_status, c.suggested_status) NOT IN ('plan to play', 'played a bit', 'playing', 'played alot but didnt finish', 'finished'))"
    );
  } else if (group === "unplayed") {
    where.push("c.filtered_reason IS NULL");
    where.push("c.duplicate_game_id IS NULL");
    where.push("(c.proposed_catalog_game_id IS NOT NULL OR c.user_selected_catalog_game_id IS NOT NULL)");
    where.push("COALESCE(c.selected_status, c.suggested_status) = 'plan to play'");
  } else if (group === "newly_played") {
    where.push("c.filtered_reason IS NULL");
    where.push("c.duplicate_game_id IS NULL");
    where.push("(c.proposed_catalog_game_id IS NOT NULL OR c.user_selected_catalog_game_id IS NOT NULL)");
    where.push("ugs.first_play_observed_at IS NOT NULL");
  } else if (group === "played_bit") {
    where.push("c.filtered_reason IS NULL");
    where.push("c.duplicate_game_id IS NULL");
    where.push("(c.proposed_catalog_game_id IS NOT NULL OR c.user_selected_catalog_game_id IS NOT NULL)");
    where.push("ugs.first_play_observed_at IS NULL");
    where.push("COALESCE(c.selected_status, c.suggested_status) = 'played a bit'");
  } else if (group === "playing") {
    where.push("c.filtered_reason IS NULL");
    where.push("c.duplicate_game_id IS NULL");
    where.push("(c.proposed_catalog_game_id IS NOT NULL OR c.user_selected_catalog_game_id IS NOT NULL)");
    where.push("ugs.first_play_observed_at IS NULL");
    where.push("COALESCE(c.selected_status, c.suggested_status) = 'playing'");
  } else if (group === "played_alot") {
    where.push("c.filtered_reason IS NULL");
    where.push("c.duplicate_game_id IS NULL");
    where.push("(c.proposed_catalog_game_id IS NOT NULL OR c.user_selected_catalog_game_id IS NOT NULL)");
    where.push("ugs.first_play_observed_at IS NULL");
    where.push("COALESCE(c.selected_status, c.suggested_status) = 'played alot but didnt finish'");
  } else if (group === "likely_finished") {
    where.push("c.filtered_reason IS NULL");
    where.push("c.duplicate_game_id IS NULL");
    where.push("(c.proposed_catalog_game_id IS NOT NULL OR c.user_selected_catalog_game_id IS NOT NULL)");
    where.push("ugs.first_play_observed_at IS NULL");
    where.push("COALESCE(c.selected_status, c.suggested_status) = 'finished'");
  } else if (group === "needs_match") {
    where.push("c.filtered_reason IS NULL");
    where.push("c.duplicate_game_id IS NULL");
    where.push("c.proposed_catalog_game_id IS NULL AND c.user_selected_catalog_game_id IS NULL");
  } else if (group === "duplicates") {
    where.push("c.filtered_reason IS NULL");
    where.push("c.duplicate_game_id IS NOT NULL");
  } else if (group === "filtered") {
    where.push("c.filtered_reason IS NOT NULL");
  } else if (group !== "all") {
    throw badRequest("Invalid import candidate group.");
  }
}

function appendAchievementWhere(where, achievement) {
  if (!achievement || achievement === "all") return;
  if (achievement === "has") {
    where.push("ugs.achievements_status = 'synced' AND COALESCE(ugs.achievements_total, 0) > 0");
  } else if (achievement === "complete") {
    where.push("ugs.achievements_status = 'synced' AND COALESCE(ugs.achievements_percent, 0) >= 100");
  } else if (achievement === "close") {
    where.push(
      "ugs.achievements_status = 'synced' AND COALESCE(ugs.achievements_percent, 0) >= 80 AND COALESCE(ugs.achievements_percent, 0) < 100"
    );
  } else if (achievement === "not_synced") {
    where.push("(ugs.id IS NOT NULL AND (ugs.achievements_last_synced_at IS NULL OR ugs.achievements_status = 'unknown'))");
  } else if (achievement === "unavailable") {
    where.push("ugs.achievements_status IN ('private', 'unavailable', 'failed')");
  } else {
    throw badRequest("Invalid achievement filter.");
  }
}

export function steamCandidateOrderBy(sort = "suggested") {
  const orders = {
    suggested: `
      CASE
        WHEN c.filtered_reason IS NULL
         AND c.duplicate_game_id IS NULL
         AND (c.proposed_catalog_game_id IS NOT NULL OR c.user_selected_catalog_game_id IS NOT NULL)
         AND ugs.first_play_observed_at IS NOT NULL
          THEN 1
        WHEN c.filtered_reason IS NULL
         AND c.duplicate_game_id IS NULL
         AND (c.proposed_catalog_game_id IS NOT NULL OR c.user_selected_catalog_game_id IS NOT NULL)
         AND COALESCE(ugs.playtime_minutes_forever, c.playtime_minutes_forever, 0) > 0
         AND COALESCE(ugs.last_played_at, c.last_played_at) >= NOW() - INTERVAL '${RECENT_STEAM_ACTIVITY_DAYS} days'
          THEN 2
        WHEN c.import_status IN ('pending', 'accepted') AND c.created_at >= NOW() - INTERVAL '14 days'
          THEN 3
        WHEN c.filtered_reason IS NULL
         AND c.duplicate_game_id IS NULL
         AND c.proposed_catalog_game_id IS NULL
         AND c.user_selected_catalog_game_id IS NULL
          THEN 4
        WHEN c.duplicate_game_id IS NOT NULL
          THEN 5
        WHEN c.filtered_reason IS NOT NULL
          THEN 6
        ELSE 7
      END,
      ugs.first_play_observed_at DESC NULLS LAST,
      COALESCE(ugs.last_played_at, c.last_played_at) DESC NULLS LAST,
      c.created_at DESC,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    name: `
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    newly_synced: `
      c.created_at DESC,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    playtime_desc: `
      COALESCE(ugs.playtime_minutes_forever, c.playtime_minutes_forever, 0) DESC,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    playtime_asc: `
      COALESCE(ugs.playtime_minutes_forever, c.playtime_minutes_forever, 0) ASC,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    last_played_desc: `
      COALESCE(ugs.last_played_at, c.last_played_at) DESC NULLS LAST,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    last_played_asc: `
      COALESCE(ugs.last_played_at, c.last_played_at) ASC NULLS LAST,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    achievement_desc: `
      ugs.achievements_percent DESC NULLS LAST,
      COALESCE(ugs.achievements_total, 0) DESC,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    achievement_asc: `
      ugs.achievements_percent ASC NULLS LAST,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    achievement_synced: `
      ugs.achievements_last_synced_at DESC NULLS LAST,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
    backlog_state: `
      CASE c.import_status
        WHEN 'pending' THEN 1
        WHEN 'accepted' THEN 2
        WHEN 'attached' THEN 3
        WHEN 'imported' THEN 4
        WHEN 'ignored' THEN 5
        ELSE 6
      END,
      c.filtered_reason NULLS FIRST,
      lower(c.steam_name) ASC,
      c.id ASC
    `,
  };
  return orders[sort] || orders.suggested;
}

async function selectCatalogBrief(catalogGameId) {
  if (!catalogGameId) return null;
  const { rows } = await pool.query(
    "SELECT id, name, released_at, rawg_playtime_hours FROM catalog_games WHERE id = $1",
    [catalogGameId]
  );
  return rows[0] || null;
}

async function findCatalogMatch(app) {
  const bySteam = await pool.query(
    `
    SELECT cg.id, cg.name
    FROM external_game_ids e
    JOIN catalog_games cg ON cg.id = e.catalog_game_id
    WHERE e.source = 'steam' AND e.external_id = $1
    LIMIT 1
    `,
    [app.appid]
  );
  if (bySteam.rows[0]) {
    return {
      catalogGameId: bySteam.rows[0].id,
      confidence: "exact",
      reason: "Matched existing Steam app id.",
    };
  }

  const normalized = normalizeGameTitle(app.name);
  if (!normalized) {
    return { catalogGameId: null, confidence: "none", reason: "Missing title." };
  }

  const variants = titleVariants(app.name);
  const { rows } = await pool.query(
    `
    SELECT id, name, released_at, rawg_playtime_hours
    FROM catalog_games
    WHERE trim(regexp_replace(translate(lower(name), '''' || chr(8217) || chr(8216) || chr(700), ''), '[^a-z0-9]+', ' ', 'g')) = ANY($1::text[])
    ORDER BY metadata_quality DESC, updated_at DESC
    LIMIT 1
    `,
    [variants]
  );
  if (rows[0]) {
    return {
      catalogGameId: rows[0].id,
      confidence: "title",
      reason: `Matched catalog title "${rows[0].name}".`,
    };
  }

  const local = await pool.query(
    `
    SELECT id, name, released_at, rawg_playtime_hours
    FROM catalog_games
    ORDER BY updated_at DESC
    LIMIT 2000
    `
  );
  let best = null;
  for (const row of local.rows) {
    const scores = titleVariants(row.name).flatMap((candidateTitle) =>
      variants.map((variant) => stringSimilarity.compareTwoStrings(variant, candidateTitle))
    );
    const rating = Math.max(0, ...scores);
    if (!best || rating > best.rating) best = { row, rating };
  }
  if (best?.rating >= 0.9) {
    return {
      catalogGameId: best.row.id,
      confidence: "title",
      reason: `Fuzzy matched local catalog title "${best.row.name}".`,
    };
  }
  return { catalogGameId: null, confidence: "none", reason: "No catalog match yet." };
}

async function findDuplicateGame(userId, app, catalogGameId) {
  const bySteamSource = await pool.query(
    `
    SELECT g.id, g.name, g.status, g.started_at
    FROM user_game_sources ugs
    JOIN games g ON g.id = ugs.game_id AND g.user_id = ugs.user_id
    WHERE ugs.user_id = $1
      AND ugs.provider = 'steam'
      AND ugs.provider_app_id = $2
      AND ugs.source_status = 'owned'
      AND ugs.game_id IS NOT NULL
    ORDER BY
      (ugs.playtime_minutes_forever IS NOT NULL AND ugs.playtime_minutes_forever > 0) DESC,
      ugs.last_synced_at DESC NULLS LAST,
      ugs.id DESC
    LIMIT 1
    `,
    [userId, app.appid]
  );
  if (bySteamSource.rows[0]) return bySteamSource.rows[0];

  if (catalogGameId) {
    const byCatalog = await pool.query(
      "SELECT id, name, status, started_at FROM games WHERE user_id = $1 AND catalog_game_id = $2 LIMIT 1",
      [userId, catalogGameId]
    );
    if (byCatalog.rows[0]) return byCatalog.rows[0];
  }
  const normalized = normalizeGameTitle(app.name);
  if (!normalized) return null;
  const { rows } = await pool.query(
    `
    SELECT id, name, status, started_at
    FROM games
    WHERE user_id = $1
      AND trim(regexp_replace(translate(lower(name), '''' || chr(8217) || chr(8216) || chr(700), ''), '[^a-z0-9]+', ' ', 'g')) = $2
    LIMIT 1
    `,
    [userId, normalized]
  );
  if (rows[0]) return rows[0];

  const allGames = await pool.query(
    `
    SELECT id, name, status, started_at
    FROM games
    WHERE user_id = $1
    ORDER BY id DESC
    LIMIT 2000
    `,
    [userId]
  );
  let best = null;
  for (const row of allGames.rows) {
    const rating = bestTitleSimilarity(app.name, row.name);
    if (!best || rating > best.rating) best = { row, rating };
  }
  return best && isLikelySteamDuplicateTitle(app.name, best.row.name) ? best.row : null;
}

async function findDuplicateGameTx(client, userId, app, catalogGameId) {
  const bySteamSource = await client.query(
    `
    SELECT g.id, g.name
    FROM user_game_sources ugs
    JOIN games g ON g.id = ugs.game_id AND g.user_id = ugs.user_id
    WHERE ugs.user_id = $1
      AND ugs.provider = 'steam'
      AND ugs.provider_app_id = $2
      AND ugs.source_status = 'owned'
      AND ugs.game_id IS NOT NULL
    ORDER BY
      (ugs.playtime_minutes_forever IS NOT NULL AND ugs.playtime_minutes_forever > 0) DESC,
      ugs.last_synced_at DESC NULLS LAST,
      ugs.id DESC
    LIMIT 1
    `,
    [userId, app.appid]
  );
  if (bySteamSource.rows[0]) return bySteamSource.rows[0];

  if (catalogGameId) {
    const byCatalog = await client.query(
      "SELECT id, name FROM games WHERE user_id = $1 AND catalog_game_id = $2 ORDER BY id LIMIT 1",
      [userId, catalogGameId]
    );
    if (byCatalog.rows[0]) return byCatalog.rows[0];
  }

  const normalized = normalizeGameTitle(app.name);
  if (!normalized) return null;
  const exactTitle = await client.query(
    `
    SELECT id, name
    FROM games
    WHERE user_id = $1
      AND trim(regexp_replace(translate(lower(name), '''' || chr(8217) || chr(8216) || chr(700), ''), '[^a-z0-9]+', ' ', 'g')) = $2
    ORDER BY id
    LIMIT 1
    `,
    [userId, normalized]
  );
  if (exactTitle.rows[0]) return exactTitle.rows[0];

  const allGames = await client.query(
    `
    SELECT id, name
    FROM games
    WHERE user_id = $1
    ORDER BY id
    LIMIT 2000
    `,
    [userId]
  );
  let best = null;
  for (const row of allGames.rows) {
    const rating = bestTitleSimilarity(app.name, row.name);
    if (!best || rating > best.rating) best = { row, rating };
  }
  return best && isLikelySteamDuplicateTitle(app.name, best.row.name) ? best.row : null;
}

async function attachSteamCandidateTx(client, userId, row, gameId, catalogGameId) {
  await client.query(
    `
    UPDATE user_game_sources
       SET game_id = $3,
           catalog_game_id = COALESCE($4, catalog_game_id),
           source_status = 'owned',
           updated_at = NOW()
     WHERE user_id = $1 AND provider = 'steam' AND provider_app_id = $2
    `,
    [userId, row.steam_app_id, gameId, catalogGameId]
  );
  await client.query(
    `
    UPDATE steam_import_candidates
       SET duplicate_game_id = $3,
           import_status = 'attached',
           decision_at = NOW(),
           updated_at = NOW()
     WHERE id = $1 AND user_id = $2
    `,
    [row.id, userId, gameId]
  );
  if (catalogGameId) {
    await client.query(
      `
      INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
      VALUES ($1, 'steam', $2, $3)
      ON CONFLICT (source, external_id)
      DO UPDATE SET catalog_game_id = EXCLUDED.catalog_game_id, updated_at = NOW()
      `,
      [catalogGameId, row.steam_app_id, `https://store.steampowered.com/app/${row.steam_app_id}`]
    );
  }
}

async function selectUserGameBriefTx(client, userId, gameId) {
  if (!gameId) return null;
  const { rows } = await client.query(
    "SELECT id, name FROM games WHERE id = $1 AND user_id = $2 LIMIT 1",
    [gameId, userId]
  );
  return rows[0] || null;
}

function sameNullableString(a, b) {
  return (a == null ? null : String(a)) === (b == null ? null : String(b));
}

function sameNullableNumber(a, b) {
  const left = a == null ? null : Number(a);
  const right = b == null ? null : Number(b);
  return left === right;
}

function sameNullableDate(a, b) {
  const left = a ? new Date(a).getTime() : null;
  const right = b ? new Date(b).getTime() : null;
  return left === right;
}

function sourceRowsEqual(before, after) {
  if (!before || !after) return false;
  return (
    sameNullableNumber(before.game_id, after.game_id) &&
    sameNullableNumber(before.catalog_game_id, after.catalog_game_id) &&
    sameNullableString(before.source_status, after.source_status) &&
    sameNullableNumber(before.playtime_minutes_forever, after.playtime_minutes_forever) &&
    sameNullableDate(before.last_played_at, after.last_played_at) &&
    sameNullableDate(before.first_play_observed_at, after.first_play_observed_at) &&
    sameNullableNumber(
      before.first_play_observed_playtime_minutes,
      after.first_play_observed_playtime_minutes
    )
  );
}

function candidateRowsEqual(before, after) {
  if (!before || !after) return false;
  return (
    sameNullableString(before.steam_name, after.steam_name) &&
    sameNullableString(before.steam_icon_url, after.steam_icon_url) &&
    sameNullableNumber(before.playtime_minutes_forever, after.playtime_minutes_forever) &&
    sameNullableDate(before.last_played_at, after.last_played_at) &&
    sameNullableNumber(before.proposed_catalog_game_id, after.proposed_catalog_game_id) &&
    sameNullableNumber(before.duplicate_game_id, after.duplicate_game_id) &&
    sameNullableString(before.match_confidence, after.match_confidence) &&
    sameNullableString(before.match_reason, after.match_reason) &&
    sameNullableString(before.filtered_reason, after.filtered_reason) &&
    sameNullableString(before.suggested_status, after.suggested_status) &&
    sameNullableString(before.suggested_status_reason, after.suggested_status_reason) &&
    sameNullableString(before.suggested_status_confidence, after.suggested_status_confidence)
  );
}

function writeState(before, after, equalFn) {
  if (!before) return "created";
  return equalFn(before, after) ? "unchanged" : "updated";
}

async function upsertSourceRow(userId, app, catalogGameId, duplicateGameId, { hasPreviousSync = false } = {}) {
  const before = await pool.query(
    `
    SELECT game_id, catalog_game_id, source_status, playtime_minutes_forever, last_played_at,
           first_play_observed_at, first_play_observed_playtime_minutes
    FROM user_game_sources
    WHERE user_id = $1 AND provider = 'steam' AND provider_app_id = $2
    LIMIT 1
    `,
    [userId, app.appid]
  );
  const playtimeMinutes = Math.max(0, Number(app.playtimeMinutes) || 0);
  const firstObservedAt =
    hasPreviousSync && playtimeMinutes > 0 ? app.lastPlayedAt || new Date() : null;
  const { rows } = await pool.query(
    `
    INSERT INTO user_game_sources (
      user_id, game_id, catalog_game_id, provider, provider_app_id,
      relationship, source_status, playtime_minutes_forever, last_played_at,
      first_play_observed_at, first_play_observed_playtime_minutes,
      last_synced_at, updated_at
    )
    VALUES ($1, $2, $3, 'steam', $4, 'owned', 'owned', $5, $6, $7, $8, NOW(), NOW())
    ON CONFLICT (user_id, provider, provider_app_id)
    DO UPDATE SET
      game_id = COALESCE(EXCLUDED.game_id, user_game_sources.game_id),
      catalog_game_id = COALESCE(EXCLUDED.catalog_game_id, user_game_sources.catalog_game_id),
      source_status = CASE
        WHEN user_game_sources.source_status = 'ignored' THEN 'ignored'
        ELSE 'owned'
      END,
      playtime_minutes_forever = GREATEST(
        COALESCE(user_game_sources.playtime_minutes_forever, 0),
        COALESCE(EXCLUDED.playtime_minutes_forever, 0)
      ),
      last_played_at = GREATEST(
        COALESCE(user_game_sources.last_played_at, EXCLUDED.last_played_at),
        COALESCE(EXCLUDED.last_played_at, user_game_sources.last_played_at)
      ),
      first_play_observed_at = CASE
        WHEN user_game_sources.first_play_observed_at IS NULL
         AND COALESCE(user_game_sources.playtime_minutes_forever, 0) <= 0
         AND COALESCE(EXCLUDED.playtime_minutes_forever, 0) > 0
          THEN COALESCE(EXCLUDED.last_played_at, NOW())
        ELSE user_game_sources.first_play_observed_at
      END,
      first_play_observed_playtime_minutes = CASE
        WHEN user_game_sources.first_play_observed_at IS NULL
         AND COALESCE(user_game_sources.playtime_minutes_forever, 0) <= 0
         AND COALESCE(EXCLUDED.playtime_minutes_forever, 0) > 0
          THEN EXCLUDED.playtime_minutes_forever
        ELSE user_game_sources.first_play_observed_playtime_minutes
      END,
      last_synced_at = NOW(),
      updated_at = NOW()
    RETURNING game_id, catalog_game_id, source_status, playtime_minutes_forever, last_played_at,
              first_play_observed_at, first_play_observed_playtime_minutes
    `,
    [
      userId,
      duplicateGameId || null,
      catalogGameId || null,
      app.appid,
      playtimeMinutes,
      app.lastPlayedAt,
      firstObservedAt,
      firstObservedAt ? playtimeMinutes : null,
    ]
  );
  const state = writeState(before.rows[0], rows[0], sourceRowsEqual);
  const firstPlayObservedJustSet =
    !before.rows[0]?.first_play_observed_at && !!rows[0]?.first_play_observed_at;
  return {
    state,
    before: before.rows[0] || null,
    row: rows[0] || null,
    firstPlayObservedJustSet,
  };
}

async function upsertCandidate(userId, app, match, duplicate, filteredReason, recommendation) {
  const before = await pool.query(
    `
    SELECT id, steam_name, steam_icon_url, playtime_minutes_forever, last_played_at,
           proposed_catalog_game_id, duplicate_game_id, match_confidence, match_reason,
           filtered_reason, suggested_status, suggested_status_reason,
           suggested_status_confidence
    FROM steam_import_candidates
    WHERE user_id = $1 AND steam_app_id = $2
    LIMIT 1
    `,
    [userId, app.appid]
  );
  const { rows } = await pool.query(
    `
    INSERT INTO steam_import_candidates (
      user_id, steam_app_id, steam_name, steam_icon_url, playtime_minutes_forever,
      last_played_at, proposed_catalog_game_id, duplicate_game_id,
      match_confidence, match_reason, filtered_reason, suggested_status,
      suggested_status_reason, suggested_status_confidence, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    ON CONFLICT (user_id, steam_app_id)
    DO UPDATE SET
      steam_name = EXCLUDED.steam_name,
      steam_icon_url = EXCLUDED.steam_icon_url,
      playtime_minutes_forever = GREATEST(
        COALESCE(steam_import_candidates.playtime_minutes_forever, 0),
        COALESCE(EXCLUDED.playtime_minutes_forever, 0)
      ),
      last_played_at = GREATEST(
        COALESCE(steam_import_candidates.last_played_at, EXCLUDED.last_played_at),
        COALESCE(EXCLUDED.last_played_at, steam_import_candidates.last_played_at)
      ),
      proposed_catalog_game_id = COALESCE(
        steam_import_candidates.user_selected_catalog_game_id,
        EXCLUDED.proposed_catalog_game_id
      ),
      duplicate_game_id = EXCLUDED.duplicate_game_id,
      match_confidence = CASE
        WHEN steam_import_candidates.user_selected_catalog_game_id IS NOT NULL THEN 'exact'
        ELSE EXCLUDED.match_confidence
      END,
      match_reason = CASE
        WHEN steam_import_candidates.user_selected_catalog_game_id IS NOT NULL THEN 'User selected catalog match.'
        ELSE EXCLUDED.match_reason
      END,
      filtered_reason = EXCLUDED.filtered_reason,
      suggested_status = EXCLUDED.suggested_status,
      suggested_status_reason = EXCLUDED.suggested_status_reason,
      suggested_status_confidence = EXCLUDED.suggested_status_confidence,
      updated_at = NOW()
    WHERE steam_import_candidates.import_status IN ('pending', 'accepted', 'attached', 'ignored')
    RETURNING id, steam_name, steam_icon_url, playtime_minutes_forever, last_played_at,
              proposed_catalog_game_id, duplicate_game_id, match_confidence, match_reason,
              filtered_reason, suggested_status, suggested_status_reason,
              suggested_status_confidence
    `,
    [
      userId,
      app.appid,
      app.name,
      app.iconUrl,
      app.playtimeMinutes,
      app.lastPlayedAt,
      match.catalogGameId,
      duplicate?.id || null,
      match.confidence,
      match.reason,
      filteredReason,
      recommendation.status,
      recommendation.reason,
      recommendation.confidence,
    ]
  );
  if (!rows[0]) return { state: "unchanged", before: before.rows[0] || null, row: before.rows[0] || null };
  return {
    state: writeState(before.rows[0], rows[0], candidateRowsEqual),
    before: before.rows[0] || null,
    row: rows[0],
  };
}

async function backfillCandidateRecommendations(userId) {
  const { rows } = await pool.query(
    `
    SELECT c.id, c.steam_name, c.playtime_minutes_forever, c.last_played_at,
           c.filtered_reason, pc.rawg_playtime_hours AS proposed_catalog_rawg_playtime_hours,
           uc.rawg_playtime_hours AS user_selected_catalog_rawg_playtime_hours
    FROM steam_import_candidates c
    LEFT JOIN catalog_games pc ON pc.id = c.proposed_catalog_game_id
    LEFT JOIN catalog_games uc ON uc.id = c.user_selected_catalog_game_id
    WHERE c.user_id = $1
      AND c.suggested_status IS NULL
      AND c.import_status IN ('pending', 'accepted')
    LIMIT 1000
    `,
    [userId]
  );
  for (const row of rows) {
    const recommendation = recommendStatus(
      {
        name: row.steam_name,
        playtimeMinutes: row.playtime_minutes_forever,
        lastPlayedAt: row.last_played_at,
      },
      {
        rawg_playtime_hours:
          row.user_selected_catalog_rawg_playtime_hours ||
          row.proposed_catalog_rawg_playtime_hours,
      },
      row.filtered_reason
    );
    await pool.query(
      `
      UPDATE steam_import_candidates
         SET suggested_status = $3,
             suggested_status_reason = $4,
             suggested_status_confidence = $5,
             updated_at = NOW()
       WHERE user_id = $1 AND id = $2 AND suggested_status IS NULL
      `,
      [userId, row.id, recommendation.status, recommendation.reason, recommendation.confidence]
    );
  }
}

function steamReviewItem(app, { candidate, game, recommendation, sourceRow }) {
  return {
    steamAppId: String(app.appid),
    steamName: app.name,
    steamIconUrl: app.iconUrl || null,
    playtimeMinutes: Number(app.playtimeMinutes) || 0,
    lastPlayedAt: app.lastPlayedAt || null,
    firstPlayObservedAt: sourceRow?.first_play_observed_at || null,
    candidateId: candidate?.id || null,
    gameId: game?.id || null,
    gameName: game?.name || null,
    currentStatus: game?.status || null,
    startedAt: game?.started_at || null,
    suggestedStatus: recommendation?.status || null,
    suggestedStatusReason: recommendation?.reason || null,
    suggestedStatusConfidence: recommendation?.confidence || null,
  };
}

function staleLinkedSteamStatus(game) {
  const status = normStatus(game?.status);
  if (!status) return false;
  return !new Set([
    "playing",
    "finished",
    "played alot but didnt finish",
    "played a lot but didn't finish",
  ]).has(status);
}

function createEmptySyncReview() {
  return {
    startedPlaying: [],
    statusSuggestions: [],
    newSteamGames: [],
    total: 0,
  };
}

function finalizeSyncReview(review) {
  review.total =
    review.startedPlaying.length +
    review.statusSuggestions.length +
    review.newSteamGames.length;
  return review;
}

export async function syncSteamLibrary(userId, { force = false } = {}) {
  const account = await getSteamAccount(userId);
  if (!account) throw badRequest("Link Steam before syncing.");
  const hasPreviousSync = Boolean(account.last_library_sync_at);

  if (!force && account.last_library_sync_at) {
    const elapsed = Date.now() - new Date(account.last_library_sync_at).getTime();
    if (Number.isFinite(elapsed) && elapsed < SYNC_COOLDOWN_MS) {
      return {
        account: serializeAccount(account),
        skipped: true,
        cooldownSeconds: Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  await pool.query(
    "UPDATE user_external_accounts SET sync_status = 'syncing', updated_at = NOW() WHERE id = $1",
    [account.id]
  );

  try {
    const [summary, games] = await Promise.all([
      fetchPlayerSummary(account.provider_user_id).catch(() => null),
      fetchOwnedSteamGames(account.provider_user_id),
    ]);

    if (!games.length) {
      const { rows } = await pool.query(
        `
        UPDATE user_external_accounts
           SET sync_status = 'private',
               last_profile_sync_at = COALESCE(last_profile_sync_at, NOW()),
               last_library_sync_at = NOW(),
               last_error_code = 'steam_library_empty_or_private',
               last_error_message = 'Steam returned no owned games. Your game details may be private.',
               updated_at = NOW()
         WHERE id = $1
         RETURNING *
        `,
        [account.id]
      );
      return { account: serializeAccount(rows[0]), total: 0, private: true };
    }

    let matched = 0;
    let duplicates = 0;
    let filtered = 0;
    let needsReview = 0;
    const review = createEmptySyncReview();
    const sourceWrites = { created: 0, updated: 0, unchanged: 0 };
    const candidateWrites = { created: 0, updated: 0, unchanged: 0 };

    for (const app of games) {
      const filteredReason = likelyFilteredReason(app.name);
      if (filteredReason) filtered++;
      const match = await findCatalogMatch(app);
      const catalog = await selectCatalogBrief(match.catalogGameId);
      const recommendation = recommendStatus(app, catalog, filteredReason);
      const duplicate = await findDuplicateGame(userId, app, match.catalogGameId);
      if (match.catalogGameId) matched++;
      else needsReview++;
      if (duplicate) duplicates++;
      const sourceResult = await upsertSourceRow(
        userId,
        app,
        match.catalogGameId,
        duplicate?.id,
        { hasPreviousSync }
      );
      const candidateState = await upsertCandidate(
        userId,
        app,
        match,
        duplicate,
        filteredReason,
        recommendation
      );
      sourceWrites[sourceResult.state] += 1;
      candidateWrites[candidateState.state] += 1;

      const reviewItem = steamReviewItem(app, {
        candidate: candidateState.row,
        game: duplicate,
        recommendation,
        sourceRow: sourceResult.row,
      });
      const hasPlaytime = (Number(app.playtimeMinutes) || 0) > 0;
      if (
        sourceResult.firstPlayObservedJustSet &&
        hasPlaytime &&
        !filteredReason &&
        recommendation.status === "playing"
      ) {
        review.startedPlaying.push(reviewItem);
      } else if (
        duplicate &&
        hasPlaytime &&
        !filteredReason &&
        recommendation.status === "playing" &&
        staleLinkedSteamStatus(duplicate)
      ) {
        review.statusSuggestions.push(reviewItem);
      }
      if (
        hasPreviousSync &&
        candidateState.state === "created" &&
        !sourceResult.firstPlayObservedJustSet &&
        !duplicate &&
        !filteredReason
      ) {
        review.newSteamGames.push(reviewItem);
      }
    }

    const autoMatch = await autoMatchSteamCandidates(
      { id: userId },
      { limit: SYNC_AUTO_MATCH_LIMIT, useCatalogSearch: true }
    );

    const { rows } = await pool.query(
      `
      UPDATE user_external_accounts
         SET display_name = COALESCE($2, display_name),
             profile_url = COALESCE($3, profile_url),
             avatar_url = COALESCE($4, avatar_url),
             visibility_state = COALESCE($5, visibility_state),
             sync_status = 'synced',
             last_profile_sync_at = CASE WHEN $2::text IS NULL THEN last_profile_sync_at ELSE NOW() END,
             last_library_sync_at = NOW(),
             last_error_code = NULL,
             last_error_message = NULL,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *
      `,
      [
        account.id,
        summary?.displayName || null,
        summary?.profileUrl || null,
        summary?.avatarUrl || null,
        summary?.visibilityState ?? null,
      ]
    );

    return {
      account: serializeAccount(rows[0]),
      total: games.length,
      matched,
      sourcesCreated: sourceWrites.created,
      sourcesUpdated: sourceWrites.updated,
      sourcesUnchanged: sourceWrites.unchanged,
      candidatesCreated: candidateWrites.created,
      candidatesUpdated: candidateWrites.updated,
      candidatesUnchanged: candidateWrites.unchanged,
      autoMatched: autoMatch.matched,
      autoReviewed: autoMatch.reviewed,
      duplicates,
      filtered,
      needsReview,
      syncReview: finalizeSyncReview(review),
      syncedAt: nowIso(),
    };
  } catch (err) {
    await pool.query(
      `
      UPDATE user_external_accounts
         SET sync_status = 'failed',
             last_error_code = $2,
             last_error_message = $3,
             updated_at = NOW()
       WHERE id = $1
      `,
      [account.id, err.code || "steam_sync_failed", err.message || "Steam sync failed."]
    );
    throw err;
  }
}

export async function listSteamImportCandidates(
  userId,
  {
    status = "active",
    group = "all",
    achievement = "all",
    sort = "suggested",
    query = "",
    limit = DEFAULT_CANDIDATE_LIMIT,
    offset = 0,
  } = {}
) {
  await backfillCandidateRecommendations(userId);
  const allowedStatuses = new Set([
    "all",
    "active",
    "done",
    "pending",
    "accepted",
    "attached",
    "ignored",
    "imported",
  ]);
  if (!allowedStatuses.has(status)) throw badRequest("Invalid import status filter.");

  const params = [userId];
  const where = ["c.user_id = $1"];
  if (status === "active") {
    where.push("c.import_status IN ('pending', 'accepted')");
  } else if (status === "done") {
    where.push("c.import_status IN ('attached', 'imported')");
  } else if (status && status !== "all") {
    params.push(status);
    where.push(`c.import_status = $${params.length}`);
  }
  const search = String(query || "").trim();
  if (search) {
    params.push(`%${search.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(
      `(c.steam_name ILIKE $${params.length} ESCAPE '\\' OR c.steam_app_id ILIKE $${params.length} ESCAPE '\\')`
    );
  }
  appendImportGroupWhere(where, group);
  appendAchievementWhere(where, achievement);

  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_CANDIDATE_LIMIT, 1), MAX_CANDIDATE_LIMIT);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const orderBy = steamCandidateOrderBy(sort);
  const count = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM steam_import_candidates c
    LEFT JOIN user_game_sources ugs
      ON ugs.user_id = c.user_id
     AND ugs.provider = 'steam'
     AND ugs.provider_app_id = c.steam_app_id
     AND ugs.source_status = 'owned'
    WHERE ${where.join(" AND ")}
    `,
    params
  );
  params.push(safeLimit);
  const limitParam = params.length;
  params.push(safeOffset);
  const offsetParam = params.length;
  const { rows } = await pool.query(
    `
    SELECT c.*,
           pc.name AS proposed_catalog_name,
           pc.cover_url AS proposed_catalog_cover_url,
           pc.released_at AS proposed_catalog_released_at,
           pc.rawg_playtime_hours AS proposed_catalog_rawg_playtime_hours,
           uc.name AS user_selected_catalog_name,
           uc.rawg_playtime_hours AS user_selected_catalog_rawg_playtime_hours,
           ugs.playtime_minutes_forever AS source_playtime_minutes_forever,
           ugs.last_played_at AS source_last_played_at,
           ugs.first_play_observed_at,
           ugs.first_play_observed_playtime_minutes,
           ugs.achievements_unlocked,
           ugs.achievements_total,
           ugs.achievements_percent,
           ugs.achievements_status,
           ugs.achievements_last_synced_at,
           ugs.achievements_last_error_code,
           ugs.achievements_last_error_message,
           ugs.game_id AS linked_game_id,
           g.name AS duplicate_game_name
    FROM steam_import_candidates c
    LEFT JOIN user_game_sources ugs
      ON ugs.user_id = c.user_id
     AND ugs.provider = 'steam'
     AND ugs.provider_app_id = c.steam_app_id
     AND ugs.source_status = 'owned'
    LEFT JOIN catalog_games pc ON pc.id = c.proposed_catalog_game_id
    LEFT JOIN catalog_games uc ON uc.id = c.user_selected_catalog_game_id
    LEFT JOIN games g ON g.id = c.duplicate_game_id AND g.user_id = c.user_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${limitParam}
    OFFSET $${offsetParam}
    `,
    params
  );
  const allRows = await summarizeAllCandidates(userId);
  const stateRows = await summarizeCandidatesForState(userId, status);
  return {
    candidates: rows.map(serializeCandidate),
    summary: {
      ...allRows,
      state: stateRows,
    },
    page: {
      limit: safeLimit,
      offset: safeOffset,
      total: count.rows[0]?.total || 0,
      hasMore: safeOffset + rows.length < (count.rows[0]?.total || 0),
    },
  };
}

export async function applySteamStatusSuggestion(
  userId,
  gameId,
  { status = "playing", setStartedAt = false, startedAt = null } = {}
) {
  const statusNorm = normStatus(status);
  if (statusNorm !== "playing") {
    throw badRequest("Only playing status suggestions are supported right now.");
  }

  const suggestedDate = startedAt ? new Date(startedAt) : null;
  const dateValue =
    suggestedDate && Number.isFinite(suggestedDate.getTime())
      ? suggestedDate.toISOString().slice(0, 10)
      : null;

  const { rows } = await pool.query(
    `
    UPDATE games g
       SET status = $3,
           started_at = CASE
             WHEN $4::boolean AND g.started_at IS NULL THEN COALESCE($5::date, CURRENT_DATE)
             ELSE g.started_at
           END,
           updated_at = NOW()
     WHERE g.id = $1
       AND g.user_id = $2
       AND EXISTS (
         SELECT 1
         FROM user_game_sources ugs
         WHERE ugs.user_id = g.user_id
           AND ugs.game_id = g.id
           AND ugs.provider = 'steam'
           AND ugs.source_status = 'owned'
       )
     RETURNING id, name, status, started_at
    `,
    [gameId, userId, statusNorm, !!setStartedAt, dateValue]
  );
  if (!rows[0]) throw badRequest("Steam-linked backlog game not found.");
  return {
    game: {
      id: rows[0].id,
      name: rows[0].name,
      status: rows[0].status,
      startedAt: rows[0].started_at,
    },
  };
}

async function summarizeAllCandidates(userId) {
  const { rows } = await pool.query(
    `
    SELECT c.import_status, c.proposed_catalog_game_id, c.user_selected_catalog_game_id,
           c.duplicate_game_id, c.filtered_reason, c.suggested_status, c.selected_status,
           c.steam_name,
           GREATEST(
             COALESCE(c.playtime_minutes_forever, 0),
             COALESCE(ugs.playtime_minutes_forever, 0)
           ) AS playtime_minutes_forever,
           GREATEST(
             COALESCE(c.last_played_at, ugs.last_played_at),
             COALESCE(ugs.last_played_at, c.last_played_at)
           ) AS last_played_at,
           ugs.first_play_observed_at
    FROM steam_import_candidates c
    LEFT JOIN user_game_sources ugs
      ON ugs.user_id = c.user_id
     AND ugs.provider = 'steam'
     AND ugs.provider_app_id = c.steam_app_id
     AND ugs.source_status = 'owned'
    WHERE c.user_id = $1
    `,
    [userId]
  );
  return summarizeCandidates(rows);
}

async function summarizeCandidatesForState(userId, status) {
  const allowedStatuses = new Set([
    "all",
    "active",
    "done",
    "pending",
    "accepted",
    "attached",
    "ignored",
    "imported",
  ]);
  if (!allowedStatuses.has(status)) throw badRequest("Invalid import status filter.");
  const params = [userId];
  const where = ["c.user_id = $1"];
  if (status === "active") {
    where.push("c.import_status IN ('pending', 'accepted')");
  } else if (status === "done") {
    where.push("c.import_status IN ('attached', 'imported')");
  } else if (status !== "all") {
    params.push(status);
    where.push(`c.import_status = $${params.length}`);
  }
  const { rows } = await pool.query(
    `
    SELECT c.import_status, c.proposed_catalog_game_id, c.user_selected_catalog_game_id,
           c.duplicate_game_id, c.filtered_reason, c.suggested_status, c.selected_status,
           c.steam_name,
           GREATEST(
             COALESCE(c.playtime_minutes_forever, 0),
             COALESCE(ugs.playtime_minutes_forever, 0)
           ) AS playtime_minutes_forever,
           GREATEST(
             COALESCE(c.last_played_at, ugs.last_played_at),
             COALESCE(ugs.last_played_at, c.last_played_at)
           ) AS last_played_at,
           ugs.first_play_observed_at
    FROM steam_import_candidates c
    LEFT JOIN user_game_sources ugs
      ON ugs.user_id = c.user_id
     AND ugs.provider = 'steam'
     AND ugs.provider_app_id = c.steam_app_id
     AND ugs.source_status = 'owned'
    WHERE ${where.join(" AND ")}
    `,
    params
  );
  return summarizeCandidates(rows);
}

function summarizeCandidates(rows) {
  const summary = {
    total: rows.length,
    pending: 0,
    accepted: 0,
    attached: 0,
    ignored: 0,
    imported: 0,
    matched: 0,
    needsReview: 0,
    duplicates: 0,
    filtered: 0,
    groups: {
      matched: 0,
      newly_played: 0,
      unplayed: 0,
      played_bit: 0,
      playing: 0,
      played_alot: 0,
      likely_finished: 0,
      needs_match: 0,
      duplicates: 0,
      filtered: 0,
    },
  };
  for (const row of rows) {
    summary[row.import_status] = (summary[row.import_status] || 0) + 1;
    if (row.proposed_catalog_game_id || row.user_selected_catalog_game_id) {
      summary.matched++;
    } else {
      summary.needsReview++;
    }
    if (row.duplicate_game_id) summary.duplicates++;
    if (row.filtered_reason) summary.filtered++;
    const group = reviewGroupForCandidate(row);
    summary.groups[group] = (summary.groups[group] || 0) + 1;
  }
  return summary;
}

function serializeCandidate(row) {
  const selectedCatalogId = row.user_selected_catalog_game_id || row.proposed_catalog_game_id;
  const playtimeMinutes =
    row.source_playtime_minutes_forever ?? row.playtime_minutes_forever;
  const lastPlayedAt = row.source_last_played_at || row.last_played_at;
  const fallbackRecommendation = row.suggested_status
    ? null
    : recommendStatus(
        {
          name: row.steam_name,
          playtimeMinutes,
          lastPlayedAt,
        },
        {
          rawg_playtime_hours:
            row.user_selected_catalog_rawg_playtime_hours ||
            row.proposed_catalog_rawg_playtime_hours,
        },
        row.filtered_reason
      );
  return {
    id: row.id,
    steamAppId: row.steam_app_id,
    steamName: row.steam_name,
    steamIconUrl: row.steam_icon_url,
    playtimeMinutes,
    lastPlayedAt,
    firstPlayObservedAt: row.first_play_observed_at || null,
    firstPlayObservedPlaytimeMinutes: row.first_play_observed_playtime_minutes ?? null,
    achievements: serializeAchievementSummary(row),
    proposedCatalogGameId: selectedCatalogId,
    proposedCatalogName:
      row.user_selected_catalog_name || row.proposed_catalog_name || null,
    proposedCatalogCoverUrl: row.proposed_catalog_cover_url,
    proposedCatalogReleasedAt: row.proposed_catalog_released_at,
    linkedGameId: row.linked_game_id,
    duplicateGameId: row.duplicate_game_id,
    duplicateGameName: row.duplicate_game_name,
    matchConfidence: row.match_confidence,
    matchReason: row.match_reason,
    importStatus: row.import_status,
    filteredReason: row.filtered_reason,
    suggestedStatus: row.suggested_status || fallbackRecommendation?.status || null,
    suggestedStatusReason:
      row.suggested_status_reason || fallbackRecommendation?.reason || null,
    suggestedStatusConfidence:
      row.suggested_status_confidence || fallbackRecommendation?.confidence || null,
    selectedStatus: row.selected_status,
    decisionAt: row.decision_at,
  };
}

function serializeSteamLinkCandidate(row) {
  if (!row) return null;
  const playtimeMinutes =
    row.source_playtime_minutes_forever ?? row.playtime_minutes_forever;
  const lastPlayedAt = row.source_last_played_at || row.last_played_at;
  return {
    id: row.id,
    steamAppId: row.steam_app_id,
    steamName: row.steam_name,
    steamIconUrl: row.steam_icon_url,
    playtimeMinutes,
    lastPlayedAt,
    achievements: serializeAchievementSummary(row),
    linkedGameId: row.linked_game_id,
    linkedGameName: row.linked_game_name,
    proposedCatalogGameId: row.user_selected_catalog_game_id || row.proposed_catalog_game_id,
    proposedCatalogName: row.user_selected_catalog_name || row.proposed_catalog_name,
    importStatus: row.import_status,
  };
}

function csvParts(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeCsv(...values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    for (const part of csvParts(value)) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part);
    }
  }
  return out.length ? out.join(", ") : null;
}

function gameCompletenessScore(row) {
  let score = 0;
  if (row.steam_source_count > 0) score += 8;
  if (row.favorite_rank != null) score += 6;
  if (row.thoughts) score += 5;
  if (row.my_genre) score += 4;
  if (row.my_score != null) score += 3;
  if (row.started_at) score += 2;
  if (row.finished_at) score += 2;
  if (row.rawg_id || row.catalog_game_id) score += 2;
  return score;
}

function serializeDuplicateGame(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    catalogGameId: row.catalog_game_id,
    myGenre: row.my_genre,
    myScore: row.my_score,
    hasThoughts: !!row.thoughts,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    favoriteRank: row.favorite_rank,
    steamSourceCount: Number(row.steam_source_count || 0),
    steamApps: row.steam_apps || [],
    score: gameCompletenessScore(row),
  };
}

export async function listBacklogDuplicateGroups(userId) {
  const { rows } = await pool.query(
    `
    SELECT g.id,
           g.name,
           g.status,
           g.catalog_game_id,
           g.my_genre,
           g.how_long_to_beat,
           g.my_score,
           g.thoughts,
           g.rawg_id,
           g.rawg_slug,
           g.favorite_rank,
           g.started_at,
           g.finished_at,
           COUNT(ugs.id)::int AS steam_source_count,
           COALESCE(
             json_agg(
               json_build_object(
                 'appId', ugs.provider_app_id,
                 'playtimeMinutes', ugs.playtime_minutes_forever
               )
               ORDER BY ugs.provider_app_id
             ) FILTER (WHERE ugs.id IS NOT NULL),
             '[]'::json
           ) AS steam_apps
    FROM games g
    LEFT JOIN user_game_sources ugs
      ON ugs.game_id = g.id
     AND ugs.user_id = g.user_id
     AND ugs.provider = 'steam'
     AND ugs.source_status = 'owned'
    WHERE g.user_id = $1
    GROUP BY g.id
    ORDER BY lower(g.name), g.id
    `,
    [userId]
  );

  const groupsByKey = new Map();
  const addGroup = (type, value, members) => {
    if (members.length < 2) return;
    const ids = members.map((row) => row.id).sort((a, b) => a - b);
    const key = `${type}:${ids.join(",")}`;
    if (groupsByKey.has(key)) return;
    const sortedMembers = [...members].sort((a, b) => {
      const score = gameCompletenessScore(b) - gameCompletenessScore(a);
      if (score !== 0) return score;
      return a.id - b.id;
    });
    groupsByKey.set(key, {
      key,
      reason: type,
      value,
      suggestedKeepId: sortedMembers[0].id,
      games: sortedMembers.map(serializeDuplicateGame),
    });
  };

  const byCatalog = new Map();
  const byTitle = new Map();
  for (const row of rows) {
    if (row.catalog_game_id) {
      const key = String(row.catalog_game_id);
      byCatalog.set(key, [...(byCatalog.get(key) || []), row]);
    }
    const title = normalizeGameTitle(row.name);
    if (title) byTitle.set(title, [...(byTitle.get(title) || []), row]);
  }

  for (const [catalogGameId, members] of byCatalog) {
    addGroup("catalog", catalogGameId, members);
  }
  for (const [title, members] of byTitle) {
    addGroup("title", title, members);
  }

  return { groups: [...groupsByKey.values()] };
}

function firstPresent(rows, field) {
  for (const row of rows) {
    const value = row[field];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

export async function mergeBacklogDuplicateGames(userId, keepGameId, duplicateGameIds = []) {
  const keepId = Number(keepGameId);
  const removeIds = [...new Set(duplicateGameIds.map(Number).filter(Number.isInteger))]
    .filter((id) => id !== keepId);
  if (!Number.isInteger(keepId) || !removeIds.length) {
    throw badRequest("Choose one game to keep and at least one duplicate to merge.");
  }

  const allIds = [keepId, ...removeIds];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
      SELECT *
      FROM games
      WHERE user_id = $1 AND id = ANY($2::int[])
      FOR UPDATE
      `,
      [userId, allIds]
    );
    if (rows.length !== allIds.length) throw badRequest("One or more games were not found.");

    const keep = rows.find((row) => row.id === keepId);
    const duplicates = rows.filter((row) => removeIds.includes(row.id));
    const ordered = [keep, ...duplicates];
    const mergedMyGenre = mergeCsv(...ordered.map((row) => row.my_genre));
    const patch = {
      catalog_game_id: keep.catalog_game_id ?? firstPresent(duplicates, "catalog_game_id"),
      my_genre: mergedMyGenre,
      how_long_to_beat:
        keep.how_long_to_beat ?? firstPresent(duplicates, "how_long_to_beat"),
      my_score: keep.my_score ?? firstPresent(duplicates, "my_score"),
      thoughts: keep.thoughts || firstPresent(duplicates, "thoughts"),
      rawg_id: keep.rawg_id ?? firstPresent(duplicates, "rawg_id"),
      rawg_slug: keep.rawg_slug || firstPresent(duplicates, "rawg_slug"),
      favorite_rank: keep.favorite_rank ?? firstPresent(duplicates, "favorite_rank"),
      started_at: keep.started_at ?? firstPresent(duplicates, "started_at"),
      finished_at: keep.finished_at ?? firstPresent(duplicates, "finished_at"),
    };

    await client.query(
      "UPDATE games SET favorite_rank = NULL WHERE user_id = $1 AND id = ANY($2::int[])",
      [userId, removeIds]
    );
    if (patch.favorite_rank != null && keep.favorite_rank == null) {
      await client.query(
        "UPDATE games SET favorite_rank = NULL WHERE user_id = $1 AND favorite_rank = $2 AND id <> $3",
        [userId, patch.favorite_rank, keepId]
      );
    }
    await client.query(
      `
      UPDATE games
         SET catalog_game_id = $3,
             my_genre = $4,
             how_long_to_beat = $5,
             my_score = $6,
             thoughts = $7,
             rawg_id = $8,
             rawg_slug = $9,
             favorite_rank = $10,
             started_at = $11,
             finished_at = $12
       WHERE user_id = $1 AND id = $2
      `,
      [
        userId,
        keepId,
        patch.catalog_game_id,
        patch.my_genre,
        patch.how_long_to_beat,
        patch.my_score,
        patch.thoughts,
        patch.rawg_id,
        patch.rawg_slug,
        patch.favorite_rank,
        patch.started_at,
        patch.finished_at,
      ]
    );
    await client.query(
      `
      UPDATE user_game_sources
         SET game_id = $3,
             catalog_game_id = COALESCE(catalog_game_id, $4),
             updated_at = NOW()
       WHERE user_id = $1 AND game_id = ANY($2::int[])
      `,
      [userId, removeIds, keepId, patch.catalog_game_id]
    );
    await client.query(
      `
      UPDATE steam_import_candidates
         SET duplicate_game_id = $3,
             updated_at = NOW()
       WHERE user_id = $1 AND duplicate_game_id = ANY($2::int[])
      `,
      [userId, removeIds, keepId]
    );
    const deleted = await client.query(
      "DELETE FROM games WHERE user_id = $1 AND id = ANY($2::int[])",
      [userId, removeIds]
    );
    await client.query("COMMIT");
    return { keptGameId: keepId, removed: deleted.rowCount || 0 };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function listSteamLinkCandidates(
  userId,
  { query = "", gameId = null, limit = 20 } = {}
) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const params = [userId];
  const where = ["c.user_id = $1"];
  const search = String(query || "").trim();
  if (search) {
    params.push(`%${search.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(
      `(c.steam_name ILIKE $${params.length} ESCAPE '\\' OR c.steam_app_id ILIKE $${params.length} ESCAPE '\\')`
    );
  }
  const id = Number(gameId);
  params.push(Number.isInteger(id) ? id : null);
  const gameIdParam = params.length;
  params.push(safeLimit);
  const limitParam = params.length;
  const { rows } = await pool.query(
    `
    SELECT c.*,
           pc.name AS proposed_catalog_name,
           uc.name AS user_selected_catalog_name,
           ugs.playtime_minutes_forever AS source_playtime_minutes_forever,
           ugs.last_played_at AS source_last_played_at,
           ugs.achievements_unlocked,
           ugs.achievements_total,
           ugs.achievements_percent,
           ugs.achievements_status,
           ugs.achievements_last_synced_at,
           ugs.achievements_last_error_code,
           ugs.achievements_last_error_message,
           ugs.game_id AS linked_game_id,
           g.name AS linked_game_name
    FROM steam_import_candidates c
    LEFT JOIN user_game_sources ugs
      ON ugs.user_id = c.user_id
     AND ugs.provider = 'steam'
     AND ugs.provider_app_id = c.steam_app_id
     AND ugs.source_status = 'owned'
    LEFT JOIN games g ON g.id = ugs.game_id AND g.user_id = c.user_id
    LEFT JOIN catalog_games pc ON pc.id = c.proposed_catalog_game_id
    LEFT JOIN catalog_games uc ON uc.id = c.user_selected_catalog_game_id
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE
        WHEN ugs.game_id IS NULL THEN 0
        WHEN $${gameIdParam}::int IS NOT NULL AND ugs.game_id = $${gameIdParam}::int THEN 0
        ELSE 1
      END,
      lower(c.steam_name)
    LIMIT $${limitParam}
    `,
    params
  );
  return { results: rows.map(serializeSteamLinkCandidate) };
}

export async function attachSteamCandidateToGame(userId, candidateId, gameId) {
  const id = Number(candidateId);
  const targetGameId = Number(gameId);
  if (!Number.isInteger(id)) throw badRequest("Invalid Steam candidate id.");
  if (!Number.isInteger(targetGameId)) throw badRequest("Invalid game id.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const game = await client.query(
      "SELECT id, catalog_game_id FROM games WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [targetGameId, userId]
    );
    if (!game.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const candidate = await client.query(
      `
      SELECT *
      FROM steam_import_candidates
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
      `,
      [id, userId]
    );
    const row = candidate.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    const catalogGameId =
      row.user_selected_catalog_game_id ||
      row.proposed_catalog_game_id ||
      game.rows[0].catalog_game_id ||
      null;

    await client.query(
      `
      INSERT INTO user_game_sources (
        user_id, game_id, catalog_game_id, provider, provider_app_id,
        relationship, source_status, playtime_minutes_forever, last_played_at,
        last_synced_at, updated_at
      )
      VALUES ($1, $3, $4, 'steam', $2, 'owned', 'owned', $5, $6, NOW(), NOW())
      ON CONFLICT (user_id, provider, provider_app_id)
      DO UPDATE SET
        game_id = EXCLUDED.game_id,
        catalog_game_id = COALESCE(EXCLUDED.catalog_game_id, user_game_sources.catalog_game_id),
        source_status = 'owned',
        playtime_minutes_forever = GREATEST(
          COALESCE(user_game_sources.playtime_minutes_forever, 0),
          COALESCE(EXCLUDED.playtime_minutes_forever, 0)
        ),
        last_played_at = GREATEST(
          COALESCE(user_game_sources.last_played_at, EXCLUDED.last_played_at),
          COALESCE(EXCLUDED.last_played_at, user_game_sources.last_played_at)
        ),
        updated_at = NOW()
      `,
      [
        userId,
        row.steam_app_id,
        targetGameId,
        catalogGameId,
        row.playtime_minutes_forever,
        row.last_played_at,
      ]
    );
    if (catalogGameId && !game.rows[0].catalog_game_id) {
      await client.query(
        "UPDATE games SET catalog_game_id = $3 WHERE id = $1 AND user_id = $2",
        [targetGameId, userId, catalogGameId]
      );
    }
    await client.query(
      `
      UPDATE steam_import_candidates
         SET duplicate_game_id = $3,
             import_status = 'attached',
             decision_at = NOW(),
             updated_at = NOW()
       WHERE id = $1 AND user_id = $2
      `,
      [id, userId, targetGameId]
    );
    if (catalogGameId) {
      await client.query(
        `
        INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
        VALUES ($1, 'steam', $2, $3)
        ON CONFLICT (source, external_id)
        DO UPDATE SET catalog_game_id = EXCLUDED.catalog_game_id, updated_at = NOW()
        `,
        [catalogGameId, row.steam_app_id, `https://store.steampowered.com/app/${row.steam_app_id}`]
      );
    }
    await client.query("COMMIT");
    return { attached: true, candidateId: id, gameId: targetGameId };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function unlinkSteamAppFromGame(userId, gameId, steamAppId) {
  const targetGameId = Number(gameId);
  const appId = String(steamAppId || "").trim();
  if (!Number.isInteger(targetGameId)) throw badRequest("Invalid game id.");
  if (!appId) throw badRequest("steamAppId is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const game = await client.query(
      "SELECT id FROM games WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [targetGameId, userId]
    );
    if (!game.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const source = await client.query(
      `
      UPDATE user_game_sources
         SET game_id = NULL,
             updated_at = NOW()
       WHERE user_id = $1
         AND provider = 'steam'
         AND provider_app_id = $2
         AND game_id = $3
       RETURNING provider_app_id
      `,
      [userId, appId, targetGameId]
    );
    if (!source.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `
      UPDATE steam_import_candidates
         SET duplicate_game_id = NULL,
             import_status = CASE
               WHEN import_status = 'attached' THEN 'pending'
               ELSE import_status
             END,
             decision_at = CASE
               WHEN import_status = 'attached' THEN NULL
               ELSE decision_at
             END,
             updated_at = NOW()
       WHERE user_id = $1 AND steam_app_id = $2
      `,
      [userId, appId]
    );

    await client.query("COMMIT");
    return { unlinked: true, gameId: targetGameId, steamAppId: appId };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSteamImportCandidate(userId, candidateId, action, payload = {}) {
  const id = Number(candidateId);
  if (!Number.isInteger(id)) throw badRequest("Invalid candidate id.");

  if (action === "ignore") {
    const { rows } = await pool.query(
      `
      UPDATE steam_import_candidates
         SET import_status = 'ignored',
             decision_at = NOW(),
             updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *
      `,
      [id, userId]
    );
    if (!rows[0]) return null;
    await pool.query(
      `
      UPDATE user_game_sources
         SET source_status = 'ignored', ignored_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND provider = 'steam'
         AND provider_app_id = (SELECT steam_app_id FROM steam_import_candidates WHERE id = $2 AND user_id = $1)
      `,
      [userId, id]
    );
    return serializeCandidate(rows[0]);
  }

  if (action === "restore") {
    const { rows } = await pool.query(
      `
      UPDATE steam_import_candidates
         SET import_status = 'pending',
             decision_at = NULL,
             updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *
      `,
      [id, userId]
    );
    if (!rows[0]) return null;
    await pool.query(
      `
      UPDATE user_game_sources
         SET source_status = 'owned', ignored_at = NULL, updated_at = NOW()
       WHERE user_id = $1 AND provider = 'steam'
         AND provider_app_id = (SELECT steam_app_id FROM steam_import_candidates WHERE id = $2 AND user_id = $1)
         AND source_status = 'ignored'
      `,
      [userId, id]
    );
    return serializeCandidate(rows[0]);
  }

  if (action === "set_status") {
    const nextStatus = String(payload.status || "").trim();
    if (!nextStatus) throw badRequest("status is required.");
    const status = await pool.query(
      "SELECT status FROM statuses WHERE status = $1 LIMIT 1",
      [nextStatus]
    );
    if (!status.rows[0]) throw badRequest("Selected status was not found.");
    const { rows } = await pool.query(
      `
      UPDATE steam_import_candidates
         SET selected_status = $3,
             decision_at = NOW(),
             updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *
      `,
      [id, userId, nextStatus]
    );
    if (!rows[0]) return null;
    return serializeCandidate(rows[0]);
  }

  if (action === "select_catalog") {
    const catalogGameId = Number(payload.catalog_game_id);
    if (!Number.isInteger(catalogGameId)) {
      throw badRequest("catalog_game_id is required.");
    }
    const catalog = await pool.query(
      "SELECT id FROM catalog_games WHERE id = $1 LIMIT 1",
      [catalogGameId]
    );
    if (!catalog.rows[0]) throw badRequest("Selected catalog game was not found.");

    const { rows } = await pool.query(
      `
      UPDATE steam_import_candidates
         SET user_selected_catalog_game_id = $3,
             proposed_catalog_game_id = $3,
             match_confidence = 'exact',
             match_reason = 'User selected catalog match.',
             import_status = 'pending',
             decision_at = NOW(),
             updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *
      `,
      [id, userId, catalogGameId]
    );
    if (!rows[0]) return null;
    await pool.query(
      `
      UPDATE user_game_sources
         SET catalog_game_id = $3, updated_at = NOW()
       WHERE user_id = $1 AND provider = 'steam'
         AND provider_app_id = (SELECT steam_app_id FROM steam_import_candidates WHERE id = $2 AND user_id = $1)
      `,
      [userId, id, catalogGameId]
    );
    return serializeCandidate(rows[0]);
  }

  if (action === "accept") {
    const { rows } = await pool.query(
      `
      UPDATE steam_import_candidates
         SET import_status = 'accepted',
             decision_at = NOW(),
             updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *
      `,
      [id, userId]
    );
    if (!rows[0]) return null;
    return serializeCandidate(rows[0]);
  }

  throw badRequest("Unsupported import candidate action.");
}

async function resolveBulkCandidateIds(userId, candidateIds = [], scope = {}) {
  const ids = candidateIds.map(Number).filter(Number.isInteger).slice(0, BULK_SCOPE_LIMIT);
  if (ids.length) return ids;

  const group = String(scope.group || "").trim();
  if (!group) return [];
  const status = String(scope.status || "active");
  const query = String(scope.query || "").trim();
  const allowedStatuses = new Set([
    "all",
    "active",
    "done",
    "pending",
    "accepted",
    "attached",
    "ignored",
    "imported",
  ]);
  if (!allowedStatuses.has(status)) throw badRequest("Invalid import status filter.");

  const params = [userId];
  const where = ["c.user_id = $1"];
  if (status === "active") {
    where.push("c.import_status IN ('pending', 'accepted')");
  } else if (status === "done") {
    where.push("c.import_status IN ('attached', 'imported')");
  } else if (status !== "all") {
    params.push(status);
    where.push(`c.import_status = $${params.length}`);
  }
  if (query) {
    params.push(`%${query.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(
      `(c.steam_name ILIKE $${params.length} ESCAPE '\\' OR c.steam_app_id ILIKE $${params.length} ESCAPE '\\')`
    );
  }
  appendImportGroupWhere(where, group);
  params.push(BULK_SCOPE_LIMIT);
  const limitParam = params.length;
  const { rows } = await pool.query(
    `
    SELECT c.id
    FROM steam_import_candidates c
    WHERE ${where.join(" AND ")}
      AND c.import_status IN ('pending', 'accepted')
    ORDER BY lower(c.steam_name)
    LIMIT $${limitParam}
    `,
    params
  );
  return rows.map((row) => row.id);
}

export async function bulkUpdateSteamCandidates(
  userId,
  { candidateIds = [], scope = {}, action, status } = {}
) {
  const ids = await resolveBulkCandidateIds(userId, candidateIds, scope);
  if (!ids.length) throw badRequest("Choose at least one Steam import candidate.");

  if (action === "ignore") {
    const result = await pool.query(
      `
      UPDATE steam_import_candidates
         SET import_status = 'ignored', decision_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND id = ANY($2::int[])
      `,
      [userId, ids]
    );
    await pool.query(
      `
      UPDATE user_game_sources
         SET source_status = 'ignored', ignored_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND provider = 'steam'
         AND provider_app_id IN (
           SELECT steam_app_id FROM steam_import_candidates
           WHERE user_id = $1 AND id = ANY($2::int[])
         )
      `,
      [userId, ids]
    );
    return { updated: result.rowCount || 0 };
  }

  if (action === "restore") {
    const result = await pool.query(
      `
      UPDATE steam_import_candidates
         SET import_status = 'pending', decision_at = NULL, updated_at = NOW()
       WHERE user_id = $1 AND id = ANY($2::int[])
      `,
      [userId, ids]
    );
    await pool.query(
      `
      UPDATE user_game_sources
         SET source_status = 'owned', ignored_at = NULL, updated_at = NOW()
       WHERE user_id = $1 AND provider = 'steam'
         AND source_status = 'ignored'
         AND provider_app_id IN (
           SELECT steam_app_id FROM steam_import_candidates
           WHERE user_id = $1 AND id = ANY($2::int[])
         )
      `,
      [userId, ids]
    );
    return { updated: result.rowCount || 0 };
  }

  if (action === "accept") {
    const result = await pool.query(
      `
      UPDATE steam_import_candidates
         SET import_status = 'accepted', decision_at = NOW(), updated_at = NOW()
       WHERE user_id = $1
         AND id = ANY($2::int[])
         AND (proposed_catalog_game_id IS NOT NULL OR user_selected_catalog_game_id IS NOT NULL OR duplicate_game_id IS NOT NULL)
      `,
      [userId, ids]
    );
    return { updated: result.rowCount || 0 };
  }

  if (action === "set_status") {
    const nextStatus = String(status || "").trim();
    const statusRow = await pool.query(
      "SELECT status FROM statuses WHERE status = $1 LIMIT 1",
      [nextStatus]
    );
    if (!statusRow.rows[0]) throw badRequest("Selected status was not found.");
    const result = await pool.query(
      `
      UPDATE steam_import_candidates
         SET selected_status = $3, decision_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND id = ANY($2::int[])
      `,
      [userId, ids, nextStatus]
    );
    return { updated: result.rowCount || 0 };
  }

  throw badRequest("Unsupported bulk action.");
}

export async function autoMatchSteamCandidates(
  user,
  { limit = AUTO_MATCH_LIMIT, useCatalogSearch = true } = {}
) {
  const safeLimit = Math.min(Math.max(Number(limit) || AUTO_MATCH_LIMIT, 1), AUTO_MATCH_LIMIT);
  const { rows } = await pool.query(
    `
    SELECT *
    FROM steam_import_candidates
    WHERE user_id = $1
      AND import_status IN ('pending', 'accepted')
      AND proposed_catalog_game_id IS NULL
      AND user_selected_catalog_game_id IS NULL
      AND filtered_reason IS NULL
    ORDER BY lower(steam_name)
    LIMIT $2
    `,
    [user.id, safeLimit]
  );

  let matched = 0;
  let reviewed = 0;
  for (const row of rows) {
    reviewed++;
    const localMatch = await findCatalogMatch({
      appid: row.steam_app_id,
      name: row.steam_name,
    });
    let first = null;
    let score = 0;
    let reason = "";
    if (localMatch.catalogGameId) {
      const catalog = await selectCatalogBrief(localMatch.catalogGameId);
      first = { id: catalog?.id, name: catalog?.name };
      score = localMatch.confidence === "exact" ? 1 : 0.93;
      reason = localMatch.reason;
    } else if (useCatalogSearch) {
      const variants = titleVariants(row.steam_name);
      const query = variants[variants.length - 1] || row.steam_name;
      const payload = await searchCatalog(query, user);
      first = payload?.results?.[0];
      if (first?.id) {
        const firstTitle = normalizeGameTitle(first.name);
        score = Math.max(
          ...variants.map((variant) => stringSimilarity.compareTwoStrings(variant, firstTitle))
        );
        reason = `Auto-matched RAWG/catalog result "${first.name}" (${Math.round(score * 100)}%).`;
      }
    }
    if (!first?.id) continue;
    if (score < 0.74) continue;
    const catalog = await selectCatalogBrief(first.id);
    const app = {
      appid: row.steam_app_id,
      name: row.steam_name,
      playtimeMinutes: row.playtime_minutes_forever,
      lastPlayedAt: row.last_played_at,
    };
    const recommendation = recommendStatus(app, catalog, null);
    const duplicate = await findDuplicateGame(user.id, app, first.id);
    await pool.query(
      `
      UPDATE steam_import_candidates
         SET proposed_catalog_game_id = $3,
             match_confidence = $4,
             match_reason = $5,
             suggested_status = $6,
             suggested_status_reason = $7,
             suggested_status_confidence = $8,
             duplicate_game_id = $9,
             updated_at = NOW()
       WHERE id = $1 AND user_id = $2
      `,
      [
        row.id,
        user.id,
        first.id,
        score >= 0.9 ? "title" : "weak",
        reason,
        recommendation.status,
        recommendation.reason,
        recommendation.confidence,
        duplicate?.id || null,
      ]
    );
    await pool.query(
      `
      UPDATE user_game_sources
         SET catalog_game_id = $3,
             game_id = COALESCE($4, game_id),
             updated_at = NOW()
       WHERE user_id = $1 AND provider = 'steam' AND provider_app_id = $2
      `,
      [user.id, row.steam_app_id, first.id, duplicate?.id || null]
    );
    matched++;
  }
  return { reviewed, matched, limit: safeLimit };
}

async function nextPosition(client, userId, status) {
  const { rows } = await client.query(
    `
    SELECT COALESCE(MAX(g.position), 0) AS max
    FROM games g
    JOIN statuses s2 ON s2.status = g.status
    WHERE g.user_id = $1
      AND s2.rank = (SELECT rank FROM statuses WHERE status = $2)
    `,
    [userId, status]
  );
  return (rows[0]?.max || 0) + 1000;
}

export async function importSteamCandidates(userId, candidateIds = []) {
  const ids = candidateIds.map(Number).filter(Number.isInteger);
  if (!ids.length) throw badRequest("Choose at least one Steam import candidate.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
      SELECT *
      FROM steam_import_candidates
      WHERE user_id = $1
        AND id = ANY($2::int[])
        AND import_status IN ('pending', 'accepted')
      FOR UPDATE
      `,
      [userId, ids]
    );

    const imported = [];
    const attached = [];
    const skipped = [];

    for (const row of rows) {
      const catalogGameId = row.user_selected_catalog_game_id || row.proposed_catalog_game_id;
      const app = {
        appid: row.steam_app_id,
        name: row.steam_name,
        playtimeMinutes: row.playtime_minutes_forever,
        lastPlayedAt: row.last_played_at,
      };
      const markedDuplicate = row.duplicate_game_id
        ? await selectUserGameBriefTx(client, userId, row.duplicate_game_id)
        : null;
      const duplicate =
        markedDuplicate || (await findDuplicateGameTx(client, userId, app, catalogGameId));
      if (duplicate?.id) {
        await attachSteamCandidateTx(client, userId, row, duplicate.id, catalogGameId);
        attached.push(row.id);
        continue;
      }

      if (!catalogGameId) {
        skipped.push({ id: row.id, reason: "missing_catalog_match" });
        continue;
      }

      const catalog = await client.query(
        "SELECT id, name, rawg_playtime_hours FROM catalog_games WHERE id = $1",
        [catalogGameId]
      );
      if (!catalog.rows[0]) {
        skipped.push({ id: row.id, reason: "catalog_not_found" });
        continue;
      }

      const fallbackRecommendation = recommendStatus(
        {
          name: row.steam_name,
          playtimeMinutes: row.playtime_minutes_forever,
          lastPlayedAt: row.last_played_at,
        },
        catalog.rows[0],
        row.filtered_reason
      );
      const targetStatus =
        row.selected_status ||
        row.suggested_status ||
        fallbackRecommendation.status ||
        "plan to play";
      const validStatus = await client.query(
        "SELECT status FROM statuses WHERE status = $1 LIMIT 1",
        [targetStatus]
      );
      const importStatus = validStatus.rows[0]?.status || "plan to play";
      const position = await nextPosition(client, userId, importStatus);
      const inserted = await client.query(
        `
        INSERT INTO games (user_id, catalog_game_id, name, status, position)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [
          userId,
          catalogGameId,
          catalog.rows[0].name || row.steam_name,
          importStatus,
          position,
        ]
      );
      const gameId = inserted.rows[0].id;

      await client.query(
        `
        UPDATE user_game_sources
           SET game_id = $3,
               catalog_game_id = $4,
               source_status = 'owned',
               updated_at = NOW()
         WHERE user_id = $1 AND provider = 'steam' AND provider_app_id = $2
        `,
        [userId, row.steam_app_id, gameId, catalogGameId]
      );
      await client.query(
        `
        INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
        VALUES ($1, 'steam', $2, $3)
        ON CONFLICT (source, external_id)
        DO UPDATE SET catalog_game_id = EXCLUDED.catalog_game_id, updated_at = NOW()
        `,
        [catalogGameId, row.steam_app_id, `https://store.steampowered.com/app/${row.steam_app_id}`]
      );
      await client.query(
        `
        UPDATE steam_import_candidates
           SET import_status = 'imported', decision_at = NOW(), updated_at = NOW()
         WHERE id = $1
        `,
        [row.id]
      );
      imported.push({ candidateId: row.id, gameId });
    }

    await client.query("COMMIT");
    return { imported, attached, skipped };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function importSteamCandidatesForScope(userId, scope = {}) {
  const ids = await resolveBulkCandidateIds(userId, [], scope);
  if (!ids.length) throw badRequest("Choose a Steam import group with importable candidates.");
  return importSteamCandidates(userId, ids);
}

export { frontendSteamUrl };
