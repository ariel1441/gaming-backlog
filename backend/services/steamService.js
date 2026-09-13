import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import stringSimilarity from "string-similarity";
import { pool } from "../db.js";
import { assertSteamUser, invalidateSteamSyncJobs } from "./steamSyncLease.js";
import { absoluteImageUrl, steamCoverUrl } from "../utils/steamAssets.js";
import { normalizeGameTitle } from "../utils/gameTitle.js";
import { badRequest, conflict, serviceUnavailable } from "../utils/httpError.js";
import { normStatus, statusGroupOf } from "../utils/status.js";
import {
  fetchProviderResponse,
  ProviderRequestError,
  providerHttpError,
  readProviderJson,
  readProviderText,
} from "../utils/providerFetch.js";
import { searchCatalog } from "./catalogService.js";
import { replaceGamePersonalGenres } from "./personalGenreService.js";

const PROVIDER = "steam";
export const STEAM_LINK_COOKIE = "gb_steam_link_nonce";
const STEAM_LINK_TTL_MS = 15 * 60 * 1000;
const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_API_BASE = "https://api.steampowered.com";
const STEAM_MEDIA_BASE = "https://media.steampowered.com/steamcommunity/public/images/apps";
const ACHIEVEMENT_SYNC_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CANDIDATE_LIMIT = 100;
const MAX_CANDIDATE_LIMIT = 250;
const AUTO_MATCH_LIMIT = 250;
const BULK_SCOPE_LIMIT = 1000;
const ACHIEVEMENT_BATCH_LIMIT = 250;
const ACHIEVEMENT_BATCH_CONCURRENCY = 3;
const STEAM_TIMEOUT_MS = Number(process.env.STEAM_TIMEOUT_MS) || 10_000;
const STEAM_MAX_RESPONSE_BYTES =
  Number(process.env.STEAM_MAX_RESPONSE_BYTES) || 5 * 1024 * 1024;
const STEAM_MAX_RETRIES = 2;
const WISHLIST_ENRICH_PAGE_SIZE = 100;
const WISHLIST_TAG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let wishlistTagCache = { expiresAt: 0, byId: new Map() };
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

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
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

function steamLinkHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function createSteamOpenIdUrl(transactionId) {
  const state = jwt.sign(
    { transactionId, provider: PROVIDER },
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

function verifySteamState(state) {
  const decoded = jwt.verify(String(state || ""), process.env.JWT_SECRET);
  if (decoded?.provider !== PROVIDER || !decoded?.transactionId) {
    throw badRequest("Invalid Steam link state.");
  }
  return String(decoded.transactionId);
}

export async function beginSteamLink(userId) {
  await assertSteamUser(userId);
  const transactionId = crypto.randomUUID();
  const nonce = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + STEAM_LINK_TTL_MS);
  await pool.query(
    `
    INSERT INTO steam_link_transactions (id, user_id, nonce_hash, expires_at)
    VALUES ($1, $2, $3, $4)
    `,
    [transactionId, userId, steamLinkHash(nonce), expiresAt]
  );
  return {
    url: createSteamOpenIdUrl(transactionId),
    nonce,
    maxAge: STEAM_LINK_TTL_MS,
  };
}

export async function consumeSteamLink(state, nonce) {
  if (!nonce) throw badRequest("Steam link browser verification failed.");
  const transactionId = verifySteamState(state);
  const { rows } = await pool.query(
    `
    UPDATE steam_link_transactions
       SET consumed_at = NOW()
     WHERE id = $1
       AND nonce_hash = $2
       AND consumed_at IS NULL
       AND expires_at > NOW()
     RETURNING user_id
    `,
    [transactionId, steamLinkHash(nonce)]
  );
  if (!rows[0]) throw badRequest("Steam link transaction expired or was already used.");
  return Number(rows[0].user_id);
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

  const res = await fetchProviderResponse("steam", STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    timeoutMs: STEAM_TIMEOUT_MS,
    maxBytes: 64 * 1024,
  });
  const text = await readProviderText("steam", res, { maxBytes: 64 * 1024 });
  if (!res.ok) throw providerHttpError("steam", res);
  if (!text.includes("is_valid:true")) {
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
  for (let attempt = 0; attempt <= STEAM_MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetchProviderResponse("steam", url, {
        headers: { Accept: "application/json" },
        timeoutMs: STEAM_TIMEOUT_MS,
        maxBytes: STEAM_MAX_RESPONSE_BYTES,
      });
      if (!res.ok) throw providerHttpError("steam", res);
      const result = res.headers.get("x-eresult");
      if (result != null && result !== "1") {
        throw new ProviderRequestError("steam", "steam_invalid_response", "Steam could not provide an accessible response.", { retryable: false });
      }
      const payload = await readProviderJson("steam", res, {
        maxBytes: STEAM_MAX_RESPONSE_BYTES,
      });
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        // Protobuf JSON may omit zero-valued fields. Only transport success,
        // never an arbitrary JSON property, can confirm that omitted empty case.
        payload.__steamResult = result === "1" ? 1 : null;
      }
      return payload;
    } catch (error) {
      const retryableCodes = new Set([
        "steam_timeout",
        "steam_unavailable",
        "steam_rate_limited",
        "steam_http_error",
      ]);
      const canRetry =
        attempt < STEAM_MAX_RETRIES &&
        error?.retryable !== false &&
        retryableCodes.has(error?.code);
      if (!canRetry) throw error;
      const delayMs = Math.min(
        Math.max(Number(error?.retryAfterMs) || 0, 150 * 2 ** attempt) + Math.floor(Math.random() * 100),
        30_000,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw serviceUnavailable("Steam is temporarily unavailable.");
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
        playtimeMinutes: game.playtime_forever != null && Number.isFinite(Number(game.playtime_forever))
          ? Math.max(0, Math.trunc(Number(game.playtime_forever)))
          : null,
        lastPlayedAt: Number(game.rtime_last_played)
          ? new Date(Number(game.rtime_last_played) * 1000).toISOString()
          : null,
      };
    })
    .filter(Boolean);
}

export function normalizeWishlistPayload(payload, countPayload = null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError("steam", "steam_wishlist_invalid_response", "Steam returned an invalid wishlist response.");
  }
  const response = payload.response;
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new ProviderRequestError("steam", "steam_wishlist_invalid_response", "Steam returned an invalid wishlist response.");
  }
  const rawItems = response.items;
  if (rawItems != null && !Array.isArray(rawItems)) {
    throw new ProviderRequestError("steam", "steam_wishlist_invalid_response", "Steam returned invalid wishlist items.");
  }
  const items = (rawItems || []).map((item) => {
    const appid = String(item?.appid ?? "").trim();
    const priority = Number(item?.priority);
    const dateAdded = Number(item?.date_added);
    if (item?.date_added != null && (!Number.isInteger(dateAdded) || dateAdded < 0 || dateAdded > 8_640_000_000_000)) {
      throw new ProviderRequestError("steam", "steam_wishlist_invalid_response", "Steam returned a malformed wishlist date.");
    }
    if (!/^[1-9]\d{0,19}$/.test(appid) || !Number.isInteger(priority) || priority < 0) {
      throw new ProviderRequestError("steam", "steam_wishlist_invalid_response", "Steam returned a malformed wishlist item.");
    }
    const normalized = {
      appid,
      priority,
      dateAdded: Number.isInteger(dateAdded) && dateAdded > 0
        ? new Date(dateAdded * 1000).toISOString()
        : null,
    };
    const name = String(item?.name || "").trim();
    const coverUrl = String(item?.coverUrl || item?.cover_url || "").trim();
    const releaseDate = String(item?.releaseDate || item?.release_date || "").trim();
    const genres = Array.isArray(item?.genres)
      ? item.genres.map((genre) => String(genre || "").trim()).filter(Boolean)
      : [];
    if (name) normalized.name = name;
    if (absoluteImageUrl(coverUrl)) normalized.coverUrl = absoluteImageUrl(coverUrl);
    if (/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) normalized.releaseDate = releaseDate;
    if (genres.length) normalized.genres = genres;
    return normalized;
  });
  if (new Set(items.map((item) => item.appid)).size !== items.length) {
    throw new ProviderRequestError("steam", "steam_wishlist_invalid_response", "Steam returned duplicate wishlist items.");
  }
  const countValue = countPayload?.response?.count;
  if (countValue != null && (typeof countValue !== "number" || !Number.isInteger(countValue) || countValue < 0)) {
    throw new ProviderRequestError("steam", "steam_wishlist_invalid_response", "Steam returned an invalid wishlist count.");
  }
  const explicitCount = typeof countValue === "number" && Number.isInteger(countValue) && countValue >= 0 ? countValue : null;
  if (explicitCount != null && explicitCount !== items.length) {
    throw new ProviderRequestError("steam", "steam_wishlist_count_mismatch", "Steam wishlist count did not match its item list.");
  }
  return { items, emptyIsAmbiguous: items.length === 0 && !(
    (Array.isArray(rawItems) && explicitCount === 0) ||
    (payload.__steamResult === 1 && countPayload?.__steamResult === 1)
  ) };
}

function normalizeWishlistReleaseDate(release) {
  const timestamp = Number(release?.steam_release_date);
  if (Number.isInteger(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
  }
  const candidate = String(release?.release_date || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

export function wishlistEnrichmentRequest(steamId, startIndex, pageSize = WISHLIST_ENRICH_PAGE_SIZE) {
  const safeStart = Math.max(0, Math.trunc(Number(startIndex) || 0));
  const safePageSize = Math.min(Math.max(Math.trunc(Number(pageSize) || WISHLIST_ENRICH_PAGE_SIZE), 1), WISHLIST_ENRICH_PAGE_SIZE);
  return {
    input_json: JSON.stringify({
      steamid: String(steamId),
      context: { language: "english", country_code: "US", steam_realm: 1 },
      data_request: {
        include_assets: true,
        include_release: true,
        include_basic_info: true,
        include_tag_count: 5,
      },
      filters: {},
      start_index: safeStart,
      page_size: safePageSize,
    }),
  };
}

export function normalizeWishlistEnrichmentPayload(payload) {
  const response = payload?.response;
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new ProviderRequestError("steam", "steam_wishlist_metadata_invalid", "Steam returned invalid wishlist metadata.");
  }
  const candidates = [
    ...(Array.isArray(response?.items) ? response.items : []),
    ...(Array.isArray(response?.store_items) ? response.store_items : []),
  ];
  const byId = new Map();
  for (const entry of candidates) {
    const store = entry?.store_item || entry;
    const appid = String(entry?.appid ?? store?.appid ?? "").trim();
    if (!/^\d{1,20}$/.test(appid)) continue;
    const assets = store?.assets || entry?.assets || {};
    const value = {
      name: String(store?.name || entry?.name || "").trim() || null,
      coverUrl: steamCoverUrl(assets, entry?.capsule),
      releaseDate: normalizeWishlistReleaseDate(store?.release || entry?.release),
      tagIds: (Array.isArray(store?.tagids) ? store.tagids : store?.tags || [])
        .map((tag) => String(tag?.tagid ?? tag ?? "").trim())
        .filter((tagid) => /^\d+$/.test(tagid))
        .slice(0, 5),
    };
    if (value.name || value.coverUrl || value.releaseDate || value.tagIds.length) {
      byId.set(appid, mergeWishlistMetadata(byId.get(appid), value));
    }
  }
  return byId;
}

async function wishlistTagNames() {
  if (wishlistTagCache.expiresAt > Date.now() && wishlistTagCache.byId.size) {
    return wishlistTagCache.byId;
  }
  const payload = await steamGet("/IStoreService/GetMostPopularTags/v1/", {
    key: requireSteamApiKey(),
    language: "english",
  });
  const tags = payload?.response?.tags;
  if (!Array.isArray(tags)) {
    throw new ProviderRequestError("steam", "steam_wishlist_tags_invalid", "Steam returned invalid store tags.");
  }
  const byId = new Map();
  for (const tag of tags) {
    const tagid = String(tag?.tagid ?? "").trim();
    const name = String(tag?.name || "").trim();
    if (/^\d+$/.test(tagid) && name) byId.set(tagid, name);
  }
  wishlistTagCache = { expiresAt: Date.now() + WISHLIST_TAG_CACHE_TTL_MS, byId };
  return byId;
}

export function mergeWishlistMetadata(previous = {}, next = {}) {
  return Object.fromEntries(Object.entries({ ...previous, ...Object.fromEntries(
    Object.entries(next).filter(([, value]) => value != null && value !== "" && (!Array.isArray(value) || value.length)),
  ) }));
}

function summarizeWishlistMetadata(items, failedPages = []) {
  const named = items.filter((item) => item.name).length;
  const covered = items.filter((item) => absoluteImageUrl(item.coverUrl)).length;
  const tagged = items.filter((item) => Array.isArray(item.genres) && item.genres.length).length;
  return {
    expected: items.length,
    named,
    covered,
    tagged,
    failedPages,
    complete: failedPages.length === 0 && named === items.length && covered === items.length && tagged === items.length,
  };
}

export async function fetchSteamWishlist(steamId) {
  if (!isProduction() && process.env.STEAM_MOCK_WISHLIST_JSON) {
    const mocked = JSON.parse(process.env.STEAM_MOCK_WISHLIST_JSON);
    const normalized = normalizeWishlistPayload(mocked.wishlist || mocked, mocked.count || null);
    return { ...normalized, items: normalized.items.map((item, providerOrder) => ({ ...item, providerOrder })), metadata: summarizeWishlistMetadata(normalized.items) };
  }
  const [wishlist, count] = await Promise.all([
    steamGet("/IWishlistService/GetWishlist/v1/", { steamid: steamId }),
    steamGet("/IWishlistService/GetWishlistItemCount/v1/", { steamid: steamId }),
  ]);
  const normalized = normalizeWishlistPayload(wishlist, count);
  const metadata = new Map();
  const failedPages = [];
  let orderedIds = null;
  for (let startIndex = 0; startIndex < normalized.items.length; startIndex += WISHLIST_ENRICH_PAGE_SIZE) {
    try {
      const page = await steamGet(
        "/IWishlistService/GetWishlistSortedFiltered/v1/",
        wishlistEnrichmentRequest(steamId, startIndex),
      );
      // Steam repeats the FULL ordered membership list; only store_item metadata is paged.
      const sequence = normalizeWishlistPayload(page).items.map((item) => item.appid);
      const expected = new Set(normalized.items.map((item) => item.appid));
      if (sequence.length !== expected.size || sequence.some((id) => !expected.has(id)) ||
          (orderedIds && sequence.some((id, index) => id !== orderedIds[index]))) {
        throw new ProviderRequestError("steam", "steam_wishlist_snapshot_changed", "Steam wishlist changed while syncing. Retry to get a consistent snapshot.");
      }
      orderedIds = sequence;
      for (const [appid, value] of normalizeWishlistEnrichmentPayload(page)) {
        metadata.set(appid, mergeWishlistMetadata(metadata.get(appid), value));
      }
    } catch (error) {
      if (error?.code === "steam_wishlist_snapshot_changed") throw error;
      failedPages.push({ startIndex, code: error?.code || "steam_wishlist_metadata_failed" });
    }
  }
  if ([...metadata.values()].some((item) => item.tagIds?.length)) {
    try {
      const tagNames = await wishlistTagNames();
      for (const value of metadata.values()) {
        value.genres = (value.tagIds || []).map((tagid) => tagNames.get(tagid)).filter(Boolean);
        delete value.tagIds;
      }
    } catch (error) {
      failedPages.push({ startIndex: null, code: error?.code || "steam_wishlist_tags_failed" });
      for (const value of metadata.values()) delete value.tagIds;
    }
  }
  const order = new Map((orderedIds || []).map((id, index) => [id, index]));
  const items = normalized.items.map((item) => ({ ...mergeWishlistMetadata(item, metadata.get(item.appid)),
    providerOrder: order.get(item.appid) ?? null,
  }));
  return {
    ...normalized,
    items,
    metadata: summarizeWishlistMetadata(items, failedPages),
  };
}

function validateOwnedGamesPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(
      "steam",
      "steam_invalid_response",
      "Steam returned an invalid owned-library response.",
    );
  }
  const response = payload.response;
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new ProviderRequestError(
      "steam",
      "steam_invalid_response",
      "Steam returned an invalid owned-library response.",
    );
  }
  if (response.games != null && !Array.isArray(response.games)) {
    throw new ProviderRequestError(
      "steam",
      "steam_invalid_response",
      "Steam returned an invalid owned-library response.",
    );
  }
  const games = response.games || [];
  const ids = new Set();
  for (const game of games) {
    const id = String(game?.appid ?? "");
    const minutes = game?.playtime_forever;
    const played = game?.rtime_last_played;
    if (!/^[1-9]\d*$/.test(id) || ids.has(id) ||
        (minutes != null && (!Number.isInteger(minutes) || minutes < 0)) ||
        (played != null && (!Number.isInteger(played) || played < 0 || played > 8_640_000_000_000))) {
      throw new ProviderRequestError("steam", "steam_invalid_response", "Steam returned malformed or duplicate library items.");
    }
    ids.add(id);
  }
  if (response.game_count != null && (!Number.isInteger(response.game_count) || response.game_count !== games.length)) {
    throw new ProviderRequestError("steam", "steam_invalid_response", "Steam library count did not match its items.");
  }
  return payload;
}

export async function fetchOwnedSteamGames(steamId) {
  if (!isProduction() && process.env.STEAM_MOCK_OWNED_GAMES_JSON) {
    return normalizeOwnedGamesPayload(
      validateOwnedGamesPayload(
        JSON.parse(process.env.STEAM_MOCK_OWNED_GAMES_JSON),
      ),
    );
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
  return normalizeOwnedGamesPayload(validateOwnedGamesPayload(payload));
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

// Keep the disconnected account row as provenance for Wishlist history. Re-linking
// starts a fresh factual baseline while retaining catalog links and user decisions.
async function retireSteamAccount(client, userId) {
  await client.query(`UPDATE steam_price_monitors SET active = FALSE, comparison_observation_id = NULL
    WHERE user_id = $1 AND active`, [userId]);
  await client.query(
    `UPDATE user_external_accounts SET sync_status = 'disconnected',
      disconnected_at = NOW(), auto_sync_enabled = FALSE, updated_at = NOW()
     WHERE user_id = $1 AND provider = 'steam' AND disconnected_at IS NULL`, [userId],
  );
  await client.query(
    `UPDATE user_game_sources SET source_status = 'disconnected', game_id = NULL,
      playtime_minutes_forever = NULL, last_played_at = NULL, last_synced_at = NULL,
      first_play_observed_at = NULL, first_play_observed_playtime_minutes = NULL,
      ownership_observed_run_id = NULL,
      achievements_unlocked = NULL, achievements_total = NULL, achievements_percent = NULL,
      achievements_status = 'unknown', achievements_last_synced_at = NULL,
      achievements_last_attempt_at = NULL, achievements_last_error_code = NULL,
      achievements_last_error_message = NULL, achievements_pending_at = NULL,
      achievements_next_attempt_at = NULL, achievements_attempts = 0,
      achievements_revision = achievements_revision + 1, updated_at = NOW()
     WHERE user_id = $1 AND provider = 'steam'`, [userId],
  );
  await client.query(
    `UPDATE steam_wishlist_items SET is_active = FALSE, removed_at = NOW(),
      removal_reason = 'account_disconnected', last_changed_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND is_active`, [userId],
  );
  await client.query(
    `UPDATE user_activity_events SET state = 'resolved', resolved_at = NOW()
     WHERE user_id = $1 AND source IN ('steam_library', 'steam_wishlist') AND state = 'open'`, [userId],
  );
}

export async function upsertSteamAccount(userId, steamId, summary = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertSteamUser(userId, client);
    await invalidateSteamSyncJobs(client, userId);
    const owner = await client.query(
      `
      SELECT user_id
      FROM user_external_accounts
       WHERE provider = 'steam'
         AND provider_user_id = $1
         AND user_id <> $2
         AND disconnected_at IS NULL
      FOR UPDATE
      `,
      [String(steamId), userId]
    );
    if (owner.rows[0]) {
      throw conflict("This Steam account is already linked to another account.");
    }
    const previous = await client.query(
      `SELECT id, provider_user_id FROM user_external_accounts
       WHERE user_id = $1 AND provider = 'steam' AND disconnected_at IS NULL FOR UPDATE`, [userId],
    );
    if (!previous.rows[0] || previous.rows[0].provider_user_id !== String(steamId)) {
      await retireSteamAccount(client, userId);
    }
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
        last_library_sync_at = CASE WHEN user_external_accounts.provider_user_id = EXCLUDED.provider_user_id THEN user_external_accounts.last_library_sync_at ELSE NULL END,
        last_wishlist_sync_at = CASE WHEN user_external_accounts.provider_user_id = EXCLUDED.provider_user_id THEN user_external_accounts.last_wishlist_sync_at ELSE NULL END,
        auto_sync_enabled = CASE WHEN user_external_accounts.provider_user_id = EXCLUDED.provider_user_id THEN user_external_accounts.auto_sync_enabled ELSE FALSE END,
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
    if (err?.code === "23505") {
      throw conflict("This Steam account is already linked to another account.");
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function getSteamAccount(userId, client = pool) {
  const { rows } = await client.query(
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

export function serializeSteamAccount(row) {
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
    autoSyncEnabled: Boolean(row.auto_sync_enabled),
    wishlistSyncStatus: row.wishlist_sync_status || "never",
    lastWishlistSyncAttemptAt: row.last_wishlist_sync_attempt_at || null,
    lastWishlistSyncAt: row.last_wishlist_sync_at || null,
    wishlistLastErrorCode: row.wishlist_last_error_code || null,
    wishlistLastErrorMessage: row.wishlist_last_error_message || null,
    wishlistEmptyObservations: Number(row.wishlist_empty_observations) || 0,
    priceSyncStatus: row.price_sync_status || 'never',
    lastPriceAttemptAt: row.last_price_attempt_at || null,
    lastPriceSyncAt: row.last_price_sync_at || null,
    priceNextAttemptAt: row.price_next_attempt_at || null,
    priceLastError: row.price_last_error || null,
    priceRevision: String(row.price_revision || 0),
    linkedAt: row.linked_at,
  };
}

export async function getSteamAccountPayload(userId) {
  return { account: serializeSteamAccount(await getSteamAccount(userId)) };
}

export async function updateSteamAutoSync(userId, enabled) {
  const { rows } = await pool.query(
    `
    UPDATE user_external_accounts account
       SET auto_sync_enabled = $2,
           updated_at = NOW()
     WHERE account.user_id = $1
       AND account.provider = 'steam'
       AND account.disconnected_at IS NULL
       AND EXISTS (
         SELECT 1 FROM users
         WHERE users.id = account.user_id AND users.is_guest = FALSE
       )
     RETURNING account.*
    `,
    [userId, Boolean(enabled)],
  );
  if (!rows[0]) throw badRequest("Linked Steam account not found.");
  return { account: serializeSteamAccount(rows[0]) };
}

export async function disconnectSteamAccount(userId) {
  return withTransaction(async (client) => {
    await invalidateSteamSyncJobs(client, userId);
    await retireSteamAccount(client, userId);
    return { account: null };
  });
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
    SELECT ugs.*, account.id AS steam_account_id, account.provider_user_id AS steam_user_id
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
    SELECT ugs.*, account.id AS steam_account_id, account.provider_user_id AS steam_user_id
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
  return !force && achievementNextAttempt(source) > Date.now();
}

function achievementNextAttempt(source) {
  const lastAttempt = source?.achievements_last_attempt_at || source?.achievements_last_synced_at;
  return Math.max(
    new Date(source?.achievements_next_attempt_at || 0).getTime(),
    lastAttempt ? new Date(lastAttempt).getTime() + ACHIEVEMENT_SYNC_COOLDOWN_MS : 0,
  );
}

// Manual refreshes use the same account/source fence as queued follow-up writes.
// A response observed before new activity must not clear that activity's pending work.
async function writeAchievementResult(source, writeGuard, work) {
  return (writeGuard || withTransaction)(async (client) => {
    const account = await client.query(
      `SELECT id FROM user_external_accounts WHERE id = $1 AND user_id = $2
        AND provider_user_id = $3 AND disconnected_at IS NULL FOR UPDATE`,
      [source.steam_account_id, source.user_id, source.steam_user_id],
    );
    if (!account.rows[0]) return null;
    const current = await client.query(
      `SELECT id FROM user_game_sources WHERE id = $1 AND user_id = $2
        AND source_status = 'owned' AND game_id = $3 AND achievements_revision = $4 FOR UPDATE`,
      [source.id, source.user_id, source.game_id, source.achievements_revision],
    );
    if (!current.rows[0]) return null;
    return work(client);
  });
}

export async function listDueSteamAchievementSourceIds(userId) {
  const { rows } = await pool.query(
    `SELECT id FROM user_game_sources WHERE user_id = $1 AND provider = 'steam'
      AND source_status = 'owned' AND game_id IS NOT NULL
      AND (achievements_pending_at IS NOT NULL OR achievements_status IN ('failed', 'private', 'unavailable'))
      AND COALESCE(achievements_next_attempt_at,
        achievements_last_attempt_at + INTERVAL '6 hours',
        achievements_last_synced_at + INTERVAL '6 hours', NOW()) <= NOW()
      ORDER BY achievements_next_attempt_at NULLS FIRST, id LIMIT $2`,
    [userId, ACHIEVEMENT_BATCH_LIMIT],
  );
  return rows.map((row) => row.id);
}

async function saveAchievementSummary(sourceId, summary, client = pool) {
  const { rows } = await client.query(
    `
    UPDATE user_game_sources
       SET achievements_unlocked = $2,
           achievements_total = $3,
           achievements_percent = $4,
           achievements_status = $5,
           achievements_last_synced_at = NOW(),
           achievements_last_attempt_at = NOW(),
           achievements_pending_at = NULL,
           achievements_next_attempt_at = NULL,
           achievements_attempts = 0,
           achievements_revision = achievements_revision + 1,
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

async function saveAchievementFailure(sourceId, err, client = pool) {
  const { rows } = await client.query(
    `
    UPDATE user_game_sources
       SET achievements_status = $4,
           achievements_last_attempt_at = NOW(),
           achievements_pending_at = COALESCE(achievements_pending_at, NOW()),
           achievements_next_attempt_at = NOW() + LEAST(INTERVAL '7 days', INTERVAL '6 hours' * POWER(2, LEAST(achievements_attempts, 5))),
           achievements_attempts = LEAST(achievements_attempts + 1, 32),
           achievements_revision = achievements_revision + 1,
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
      ['private', 'unavailable'].includes(err?.achievementStatus) ? err.achievementStatus : 'failed',
    ]
  );
  return rows[0];
}

async function syncSteamAchievementSource(source, { force = false, writeGuard = null } = {}) {
  if (achievementSyncCoolingDown(source, force)) {
    return {
      skipped: true,
      reason: "cooldown",
      gameId: source.game_id,
      steamAppId: source.provider_app_id,
      achievements: serializeAchievementSummary(source),
      cooldownSeconds: Math.ceil(
        (achievementNextAttempt(source) - Date.now()) / 1000
      ),
    };
  }

  try {
    const [playerResult, schemaResult] = await Promise.allSettled([
      fetchSteamPlayerAchievements(source.steam_user_id, source.provider_app_id),
      fetchSteamAchievementSchema(source.provider_app_id),
    ]);
    if (playerResult.status === "rejected" || schemaResult.status === "rejected") {
      throw playerResult.status === "rejected" ? playerResult.reason : schemaResult.reason;
    }
    const schemaPayload = schemaResult.value;
    const playerPayload = playerResult.value;
    const summary = normalizeSteamAchievementSummary(playerPayload, schemaPayload);
    if (["private", "unavailable"].includes(summary.status)) {
      const error = new Error(summary.errorMessage);
      error.code = summary.errorCode;
      error.achievementStatus = summary.status;
      throw error;
    }
    const updated = await writeAchievementResult(source, writeGuard,
      (client) => saveAchievementSummary(source.id, summary, client));
    if (!updated) return { skipped: true, reason: "lease_lost" };
    return {
      skipped: false,
      status: summary.status,
      gameId: updated.game_id,
      steamAppId: updated.provider_app_id,
      achievements: serializeAchievementSummary(updated),
    };
  } catch (err) {
    const updated = await writeAchievementResult(source, writeGuard,
      (client) => saveAchievementFailure(source.id, err, client));
    if (!updated) return { skipped: true, reason: "lease_lost" };
    return {
      skipped: false,
      failed: true,
      status: updated.achievements_status,
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

export async function syncSteamAchievementsForSourceIds(
  userId,
  sourceIds = [],
  { force = false, writeGuard = null } = {},
) {
  const ids = Array.from(
    new Set(sourceIds.map(Number).filter(Number.isInteger)),
  );
  if (!ids.length) {
    return {
      total: 0,
      ...summarizeAchievementSyncResults([]),
      results: [],
      syncedAt: nowIso(),
    };
  }
  const results = [];
  let total = 0;
  for (let offset = 0; offset < ids.length; offset += ACHIEVEMENT_BATCH_LIMIT) {
    const batchIds = ids.slice(offset, offset + ACHIEVEMENT_BATCH_LIMIT);
    const { rows } = await pool.query(
      `
      SELECT ugs.*, account.id AS steam_account_id, account.provider_user_id AS steam_user_id
      FROM user_game_sources ugs
      JOIN user_external_accounts account
        ON account.user_id = ugs.user_id
       AND account.provider = 'steam'
       AND account.disconnected_at IS NULL
      WHERE ugs.user_id = $1
        AND ugs.id = ANY($2::int[])
        AND ugs.provider = 'steam'
        AND ugs.source_status = 'owned'
        AND ugs.game_id IS NOT NULL
      ORDER BY ugs.id
      `,
      [userId, batchIds],
    );
    total += rows.length;
    results.push(
      ...(await mapWithConcurrency(
        rows,
        ACHIEVEMENT_BATCH_CONCURRENCY,
        (source) => syncSteamAchievementSource(source, { force, writeGuard }),
      )),
    );
  }
  return {
    total,
    ...summarizeAchievementSyncResults(results),
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
}

async function selectUserGameBriefTx(client, userId, gameId) {
  if (!gameId) return null;
  const { rows } = await client.query(
    "SELECT id, name FROM games WHERE id = $1 AND user_id = $2 LIMIT 1",
    [gameId, userId]
  );
  return rows[0] || null;
}

// Candidate decisions survive reconnects; ownership evidence does not. A retained
// candidate is current only after its source was observed on this connection.
function currentSteamCandidateWhere(candidate = "c") {
  return `EXISTS (
    SELECT 1 FROM user_game_sources candidate_source
    JOIN user_external_accounts candidate_account
      ON candidate_account.user_id = candidate_source.user_id
     AND candidate_account.provider = 'steam'
     AND candidate_account.disconnected_at IS NULL
    WHERE candidate_source.user_id = ${candidate}.user_id
      AND candidate_source.provider = 'steam'
      AND candidate_source.provider_app_id = ${candidate}.steam_app_id
      AND candidate_source.source_status IN ('owned', 'ignored')
      AND candidate_source.last_synced_at >= candidate_account.linked_at
  )`;
}

async function lockCurrentSteamCandidates(client, userId, candidateIds, expectedAccountId = null) {
  // Lock account before candidates/games/sources, matching sync and retirement.
  // This keeps validation and every subsequent candidate mutation in one epoch.
  const account = await client.query(
    `SELECT id FROM user_external_accounts
     WHERE user_id = $1 AND provider = 'steam' AND disconnected_at IS NULL FOR UPDATE`,
    [userId],
  );
  if (!account.rows[0] || (expectedAccountId != null && Number(account.rows[0].id) !== Number(expectedAccountId))) {
    throw conflict("Steam connection changed. Refresh the library before reviewing these games.");
  }
  const ids = [...new Set(candidateIds)];
  const current = await client.query(
    `SELECT c.id FROM steam_import_candidates c
     WHERE c.user_id = $1 AND c.id = ANY($2::int[]) AND ${currentSteamCandidateWhere()}`,
    [userId, ids],
  );
  if (current.rows.length !== ids.length) {
    throw conflict("These games are not in the current Steam connection. Refresh the library and try again.");
  }
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
      AND ${currentSteamCandidateWhere()}
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

export async function prepareSteamLibraryCandidate(userId, app) {
  const filteredReason = likelyFilteredReason(app.name);
  const match = await findCatalogMatch(app);
  const catalog = await selectCatalogBrief(match.catalogGameId);
  const recommendation = recommendStatus(app, catalog, filteredReason);
  const duplicate = await findDuplicateGame(userId, app, match.catalogGameId);
  return { filteredReason, match, recommendation, duplicate };
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
  const where = ["c.user_id = $1", currentSteamCandidateWhere()];
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
  const summaries = await summarizeAllCandidateStates(userId);
  const stateRows =
    status === "all"
      ? summaries.all
      : status === "active"
        ? summaries.active
        : await summarizeCandidatesForState(userId, status);
  return {
    candidates: rows.map(serializeCandidate),
    summary: {
      ...summaries.all,
      active: summaries.active,
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
  {
    status = "playing",
    setStartedAt = false,
    startedAt = null,
    activityEventId = null,
  } = {}
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
  const shouldSetStartedAt = Boolean(setStartedAt && dateValue);

  return withTransaction(async (client) => {
  await assertSteamUser(userId, client);
  const account = (await client.query(`SELECT id, linked_at FROM user_external_accounts
    WHERE user_id = $1 AND provider = 'steam' AND disconnected_at IS NULL FOR UPDATE`, [userId])).rows[0];
  if (!account) throw conflict("Steam connection changed. Refresh before accepting this suggestion.");
  const game = (await client.query("SELECT status FROM games WHERE id = $1 AND user_id = $2 FOR UPDATE", [gameId, userId])).rows[0];
  if (!game) throw badRequest("Steam-linked backlog game not found.");
  if (activityEventId != null) {
    const event = await client.query(`SELECT e.id FROM user_activity_events e
      JOIN steam_sync_jobs j ON j.sync_run_id = e.sync_run_id AND j.user_id = e.user_id
      JOIN user_game_sources s ON s.user_id = e.user_id AND s.provider = 'steam'
        AND s.provider_app_id = e.external_id AND s.game_id = e.game_id
        AND s.source_status = 'owned' AND s.last_synced_at >= $5
      WHERE e.id = $1 AND e.user_id = $2 AND e.game_id = $3 AND j.account_id = $4
        AND e.source = 'steam_library' AND e.event_type = 'steam_status_suggestion' AND e.state = 'open'
        AND e.payload_json->>'currentStatus' = $6
      FOR UPDATE OF e`, [activityEventId, userId, gameId, account.id, account.linked_at, game.status]);
    if (!event.rows[0]) throw conflict("This suggestion is no longer current. Refresh to see your saved game.");
  }
  if (statusGroupOf(normStatus(game.status)) === 'done')
    throw conflict("This game is already completed. Use its Backlog editor to change its status.");
  const { rows } = await client.query(
    `
    WITH updated AS (
      UPDATE games g
         SET status = $3,
             started_at = CASE
               WHEN $4::boolean AND g.started_at IS NULL THEN $5::date
               ELSE g.started_at
             END
       WHERE g.id = $1
         AND g.user_id = $2
         AND EXISTS (
           SELECT 1
           FROM user_game_sources ugs
           WHERE ugs.user_id = g.user_id
             AND ugs.game_id = g.id
             AND ugs.provider = 'steam'
             AND ugs.source_status = 'owned'
             AND ugs.last_synced_at >= $7
         )
       RETURNING id, name, status, started_at
    ),
    removed AS (
      DELETE FROM user_next_up_games
       WHERE user_id = $2
         AND game_id IN (SELECT id FROM updated)
       RETURNING game_id
    ),
    resolved_event AS (
      UPDATE user_activity_events
         SET state = 'resolved',
             seen_at = COALESCE(seen_at, NOW()),
             resolved_at = NOW()
       WHERE id = $6
         AND user_id = $2
         AND source = 'steam_library'
         AND event_type = 'steam_status_suggestion'
         AND state = 'open'
         AND game_id IN (SELECT id FROM updated)
       RETURNING id
    )
    SELECT updated.*,
           EXISTS (SELECT 1 FROM resolved_event) AS activity_event_resolved
    FROM updated
    `,
    [
      gameId,
      userId,
      statusNorm,
      shouldSetStartedAt,
      dateValue,
      activityEventId == null ? null : Number(activityEventId),
      account.linked_at,
    ]
  );
  if (!rows[0]) throw badRequest("Steam-linked backlog game not found.");
  return {
    game: {
      id: rows[0].id,
      name: rows[0].name,
      status: rows[0].status,
      startedAt: rows[0].started_at,
    },
    activityEventResolved: Boolean(rows[0].activity_event_resolved),
  };
  });
}

async function summarizeAllCandidateStates(userId) {
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
      AND ${currentSteamCandidateWhere()}
    `,
    [userId]
  );
  return {
    all: summarizeCandidates(rows),
    active: summarizeCandidates(
      rows.filter(
        (row) =>
          row.import_status === "pending" || row.import_status === "accepted",
      ),
    ),
  };
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
  const where = ["c.user_id = $1", currentSteamCandidateWhere()];
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
    linkedGameStatus: row.linked_game_status,
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
    const membershipRows = await client.query(
      `SELECT game_id, personal_genre_id, position
         FROM game_personal_genres
        WHERE user_id = $1 AND game_id = ANY($2::int[])`,
      [userId, allIds],
    );
    const gameOrder = new Map(allIds.map((id, index) => [id, index]));
    const mergedPersonalGenreIds = membershipRows.rows
      .sort((a, b) =>
        gameOrder.get(a.game_id) - gameOrder.get(b.game_id) ||
        a.position - b.position,
      )
      .map((row) => row.personal_genre_id)
      .filter((id, index, ids) => ids.indexOf(id) === index);
    if (mergedPersonalGenreIds.length > 10) {
      throw conflict("The merged game would have more than 10 personal genres. Remove some genres first.");
    }
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
    await replaceGamePersonalGenres(
      client,
      userId,
      keepId,
      mergedPersonalGenreIds,
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
    await client.query(
      `
      INSERT INTO user_list_games (list_id, game_id, position, added_at)
      SELECT ulg.list_id, $3, MIN(ulg.position), MIN(ulg.added_at)
      FROM user_list_games ulg
      JOIN user_lists ul ON ul.id = ulg.list_id AND ul.user_id = $1
      WHERE ulg.game_id = ANY($2::int[])
      GROUP BY ulg.list_id
      ON CONFLICT (list_id, game_id) DO NOTHING
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
  { query = "", gameId = null, appId = null, limit = 20 } = {}
) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const params = [userId];
  const where = ["c.user_id = $1", currentSteamCandidateWhere()];
  if (appId != null) {
    params.push(String(appId));
    where.push(`c.steam_app_id = $${params.length}`);
  }
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
           g.name AS linked_game_name,
           g.status AS linked_game_status
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
    await lockCurrentSteamCandidates(client, userId, [id]);
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
      UPDATE user_game_sources SET
        game_id = $3,
        catalog_game_id = COALESCE($4, catalog_game_id),
        source_status = 'owned',
        updated_at = NOW()
      WHERE user_id = $1 AND provider = 'steam' AND provider_app_id = $2
      `,
      [
        userId,
        row.steam_app_id,
        targetGameId,
        catalogGameId,
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

  return withTransaction(async (client) => {
  await lockCurrentSteamCandidates(client, userId, [id]);

  if (action === "ignore") {
    const { rows } = await client.query(
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
    await client.query(
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
    const { rows } = await client.query(
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
    await client.query(
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
    const status = await client.query(
      "SELECT status FROM statuses WHERE status = $1 AND LOWER(TRIM(status)) <> 'wishlist' LIMIT 1",
      [nextStatus]
    );
    if (!status.rows[0]) throw badRequest("Selected status was not found.");
    const { rows } = await client.query(
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
    const catalog = await client.query(
      "SELECT id FROM catalog_games WHERE id = $1 LIMIT 1",
      [catalogGameId]
    );
    if (!catalog.rows[0]) throw badRequest("Selected catalog game was not found.");

    const { rows } = await client.query(
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
    await client.query(
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
    const { rows } = await client.query(
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
  });
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
  const where = ["c.user_id = $1", currentSteamCandidateWhere()];
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
    LEFT JOIN user_game_sources ugs ON ugs.user_id = c.user_id
      AND ugs.provider = 'steam' AND ugs.provider_app_id = c.steam_app_id
      AND ugs.source_status = 'owned'
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

  return withTransaction(async (client) => {
  await lockCurrentSteamCandidates(client, userId, ids);

  if (action === "ignore") {
    const result = await client.query(
      `
      UPDATE steam_import_candidates
         SET import_status = 'ignored', decision_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND id = ANY($2::int[])
      `,
      [userId, ids]
    );
    await client.query(
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
    const result = await client.query(
      `
      UPDATE steam_import_candidates
         SET import_status = 'pending', decision_at = NULL, updated_at = NOW()
       WHERE user_id = $1 AND id = ANY($2::int[])
      `,
      [userId, ids]
    );
    await client.query(
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
    const result = await client.query(
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
    const statusRow = await client.query(
      "SELECT status FROM statuses WHERE status = $1 AND LOWER(TRIM(status)) <> 'wishlist' LIMIT 1",
      [nextStatus]
    );
    if (!statusRow.rows[0]) throw badRequest("Selected status was not found.");
    const result = await client.query(
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
  });
}

export async function autoMatchSteamCandidates(
  user,
  { limit = AUTO_MATCH_LIMIT, useCatalogSearch = true, candidateIds = null, writeGuard = null } = {}
) {
  const safeLimit = Math.min(Math.max(Number(limit) || AUTO_MATCH_LIMIT, 1), AUTO_MATCH_LIMIT);
  const scopedIds = Array.isArray(candidateIds)
    ? Array.from(new Set(candidateIds.map(Number).filter(Number.isInteger)))
    : null;
  if (scopedIds && !scopedIds.length) {
    return { reviewed: 0, matched: 0, limit: safeLimit };
  }
  const { rows } = await pool.query(
    `
    SELECT *, (SELECT id FROM user_external_accounts
      WHERE user_id = $1 AND provider = 'steam' AND disconnected_at IS NULL) AS steam_account_id
    FROM steam_import_candidates
    WHERE user_id = $1
      AND ${currentSteamCandidateWhere("steam_import_candidates")}
      AND import_status IN ('pending', 'accepted')
      AND proposed_catalog_game_id IS NULL
      AND user_selected_catalog_game_id IS NULL
      AND filtered_reason IS NULL
      AND ($3::int[] IS NULL OR id = ANY($3::int[]))
    ORDER BY lower(steam_name)
    LIMIT $2
    `,
    [user.id, safeLimit, scopedIds]
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
    const updated = await (writeGuard || withTransaction)(async (client) => {
    await lockCurrentSteamCandidates(client, user.id, [row.id], row.steam_account_id);
    const candidate = await client.query(
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
       WHERE id = $1 AND user_id = $2 AND import_status IN ('pending', 'accepted') AND user_selected_catalog_game_id IS NULL
       RETURNING id
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
    if (!candidate.rows.length) return false;
    await client.query(
      `
      UPDATE user_game_sources
         SET catalog_game_id = $3,
             game_id = COALESCE($4, game_id),
             updated_at = NOW()
       WHERE user_id = $1 AND provider = 'steam' AND provider_app_id = $2
      `,
      [user.id, row.steam_app_id, first.id, duplicate?.id || null]
    );
    return true;
    });
    if (updated) matched++;
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
    await lockCurrentSteamCandidates(client, userId, ids);
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
        "SELECT status FROM statuses WHERE status = $1 AND LOWER(TRIM(status)) <> 'wishlist' LIMIT 1",
        [targetStatus]
      );
      const importStatus = validStatus.rows[0]?.status || "plan to play";
      const position = await nextPosition(client, userId, importStatus);
      const observedStart =
        statusGroupOf(importStatus) === "playing" && row.last_played_at
          ? new Date(row.last_played_at)
          : null;
      const startedAt =
        observedStart && Number.isFinite(observedStart.getTime())
          ? observedStart.toISOString().slice(0, 10)
          : null;
      const inserted = await client.query(
        `
        INSERT INTO games (user_id, catalog_game_id, name, status, position, started_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [
          userId,
          catalogGameId,
          catalog.rows[0].name || row.steam_name,
          importStatus,
          position,
          startedAt,
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
