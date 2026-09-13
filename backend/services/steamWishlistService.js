import { pool } from "../db.js";
import { sanitizeGameHtml } from '../utils/sanitizeHtml.js';
import { absoluteImageUrl } from "../utils/steamAssets.js";
import { lockSteamSyncJob } from "./steamSyncLease.js";
import { badRequest, forbidden, notFound } from "../utils/httpError.js";
import { normalizeTitle } from "../utils/hltb.js";
import { createOpenActivityEvent } from "./activityEventService.js";
import {
  finishIntegrationSyncRun,
  serializeIntegrationSyncRun,
} from "./integrationSyncService.js";
import {
  fetchSteamWishlist,
  getSteamAccount,
  serializeSteamAccount,
} from "./steamService.js";
import {
  enqueueWishlistMetadataWork,
  getWishlistMetadataStatus,
  serializeWishlistMetadataWork,
} from "./wishlistMetadataService.js";

const SOURCE = "steam_wishlist";
const EMPTY_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export function diffWishlistSnapshot(items = [], previous = []) {
  const prior = new Map(previous.map((row) => [String(row.steam_app_id), row]));
  const currentIds = new Set(items.map((item) => String(item.appid)));
  const added = [];
  const priorityChanged = [];
  for (const item of items) {
    const row = prior.get(String(item.appid));
    if (!row || !row.is_active) added.push(item);
    else if (Number(row.priority) !== item.priority) {
      priorityChanged.push({ item, previousPriority: Number(row.priority) });
    }
  }
  const removed = previous.filter((row) => row.is_active && !currentIds.has(String(row.steam_app_id)));
  return { added, removed, priorityChanged };
}

function jsonStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export function resolveWishlistEstimate(row, name, lookup) {
  const stored = Number(row.game_hltb_hours);
  if (Number.isFinite(stored) && stored > 0) return { hours: Math.round(stored), source: "saved" };
  const local = lookup?.[normalizeTitle(name)]?.main;
  if (Number.isFinite(Number(local)) && Number(local) > 0) return { hours: Math.round(Number(local)), source: "hltb_local" };
  const rawg = Number(row.catalog_playtime_hours);
  return Number.isFinite(rawg) && rawg > 0
    ? { hours: Math.round(rawg), source: "rawg_playtime" }
    : { hours: null, source: null };
}

export function serializeWishlistPrice(row) {
  const p = row.price_data;
  const o = p?.observation;
  const last = p?.lastKnown;
  const reason = row.price_reason || 'disconnected';
  const pendingBaseline = o && o.epoch !== p.epoch;
  const nextAttemptAt = p?.nextAttemptAt ? Date.parse(p.nextAttemptAt) : NaN;
  const hasFutureAttempt = Number.isFinite(nextAttemptAt) && nextAttemptAt > Date.now();
  const permanentError = ['steam_price_offer_uncertain', 'steam_price_package_mismatch', 'steam_price_unsupported_type'].includes(p?.lastError);
  const checkState = p?.lastError
    ? (permanentError ? 'error' : 'retrying')
    : (!o || pendingBaseline ? 'unchecked' : (hasFutureAttempt ? 'awaiting_scheduled_check' : 'checked'));
  return {
    country: 'IL', monitoring: reason === 'eligible', monitoringReason: reason,
    status: p?.lastError ? 'failed' : pendingBaseline ? 'not_checked' : o?.availability || 'not_checked',
    availability: pendingBaseline ? null : o?.availability || null,
    currency: o?.currency || last?.currency || null,
    currentMinor: o?.current_minor == null ? null : Number(o.current_minor),
    regularMinor: o?.regular_minor == null ? null : Number(o.regular_minor),
    discountPercent: o?.discount_percent ?? null,
    offerId: o?.offer_id || null, offerName: o?.offer_name || null,
    observedAt: o?.observed_at || null, lastAttemptAt: p?.lastAttemptAt || null,
    nextAttemptAt: p?.nextAttemptAt || null, errorCode: p?.lastError || null, checkState,
    stale: Boolean(o && (pendingBaseline || reason !== 'eligible' || p.lastError || Date.now() - new Date(o.observed_at).getTime() > 36 * 60 * 60 * 1000)),
    lastKnown: last ? { currentMinor: Number(last.current_minor), currency: last.currency, observedAt: last.observed_at } : null,
  };
}

function serializeWishlistItem(row, { hltbLookup } = {}) {
  const name = row.catalog_name || row.game_name || row.steam_name || row.display_name;
  const catalogGenres = jsonStringArray(row.catalog_genres_json);
  const genres = catalogGenres.length ? catalogGenres : jsonStringArray(row.tags_json);
  const { hours, source } = resolveWishlistEstimate(row, name, hltbLookup);
  return {
    id: Number(row.id),
    steamPrice: serializeWishlistPrice(row),
    wishlistItemId: Number(row.wishlist_item_id || row.id),
    steamAppId: row.steam_app_id || row.price_app_id || null,
    name,
    cover: [row.catalog_cover_url, row.game_cover, row.cover_url, row.steam_icon_url].map(absoluteImageUrl).find(Boolean) || null,
    status: "wishlist",
    genres,
    howLongToBeat: hours,
    displayHLTB: hours,
    estimateSource: source,
    rating: row.catalog_rawg_rating == null ? null : Number(row.catalog_rawg_rating),
    metacritic: row.catalog_metacritic == null ? null : Number(row.catalog_metacritic),
    releaseDate: row.catalog_released_at || row.release_date || null,
    description: sanitizeGameHtml(row.catalog_description_html || ""),
    priority: row.priority == null ? null : Number(row.priority),
    providerOrder: row.provider_order == null ? null : Number(row.provider_order),
    changedAt: row.last_changed_at || row.updated_at,
    metadataProvenance: row.metadata_provenance || {},
    metadataWork: serializeWishlistMetadataWork(row.metadata_work),
    metadataStatus: row.metadata_work ? serializeWishlistMetadataWork(row.metadata_work).status : "pending",
    inBacklog: row.game_id != null && String(row.game_status || "").trim().toLowerCase() !== "wishlist",
    dateAdded: row.date_added || null,
    active: Boolean(row.local_intent_active || row.is_active),
    steamActive: Boolean(row.is_active),
    localActive: Boolean(row.local_intent_active),
    removedAt: row.removed_at || null,
    removalReason: row.removal_reason || null,
    lastSeenAt: row.last_seen_at || null,
    gameId: row.game_id == null ? null : Number(row.game_id),
    catalogGameId: row.catalog_game_id == null ? null : Number(row.catalog_game_id),
    rawgId: row.catalog_rawg_id == null ? null : Number(row.catalog_rawg_id),
    rawg_id: row.catalog_rawg_id == null ? null : Number(row.catalog_rawg_id),
    metadataQuality: row.catalog_metadata_quality || null,
    metadataComplete: Boolean(row.catalog_rawg_id) &&
      row.catalog_metadata_quality === "full" &&
      Boolean(row.catalog_cover_url) && genres.length > 0,
    steamStoreUrl: row.steam_app_id || row.price_app_id ? `https://store.steampowered.com/app/${row.steam_app_id || row.price_app_id}?cc=il` : null,
  };
}

export async function assertSavedAccountUser(userId) {
  const { rows } = await pool.query("SELECT is_guest FROM users WHERE id = $1", [userId]);
  if (!rows[0]) throw notFound("Account not found.");
  if (rows[0].is_guest) throw forbidden("Steam wishlist sync is unavailable for demo accounts.");
}

export async function listWishlistItems(userId, options = {}) {
  await assertSavedAccountUser(userId);
  const active = options.active === "all" ? null : options.active !== "removed";
  const query = String(options.query || "").trim();
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const direction = options.direction === "desc" ? "DESC" : "ASC";
  const sortMap = {
    provider_order: `CASE WHEN steam.is_active THEN steam.provider_order END ${direction} NULLS LAST`,
    priority: `NULLIF(steam.priority, 0) ${direction} NULLS LAST`,
    date_added: `steam.date_added ${direction} NULLS LAST`,
    changed: `COALESCE(steam.last_changed_at, wishlist.updated_at) ${direction}`,
    name: `LOWER(COALESCE(catalog.name, game.name, candidate.steam_name, wishlist.display_name)) ${direction}`,
  };
  const order = `${sortMap[options.sort] || sortMap.provider_order}, wishlist.id ASC, steam.steam_app_id ASC`;
  const params = [userId];
  const where = ["wishlist.user_id = $1"];
  if (active === true) where.push("(wishlist.local_intent_active OR COALESCE(steam.is_active, FALSE))");
  if (active === false) where.push("NOT wishlist.local_intent_active AND steam.is_active = FALSE");
  if (query) {
    params.push(`%${query}%`);
    where.push(`COALESCE(catalog.name, game.name, candidate.steam_name, wishlist.display_name) ILIKE $${params.length}`);
  }
  params.push(limit, offset);
  const { rows, account, priceHealth, metadataHealth } = await withTransaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows } = await client.query(
    `SELECT wishlist.*, steam.wishlist_item_id, steam.steam_app_id, steam.priority,
            target.reason AS price_reason, target.steam_app_id AS price_app_id, price.data AS price_data,
            steam.date_added, steam.is_active, steam.last_seen_at, steam.removed_at, steam.provider_order, steam.last_changed_at,
            steam.removal_reason, game.name AS game_name, game.cover AS game_cover, game.status AS game_status,
            catalog.name AS catalog_name, catalog.cover_url AS catalog_cover_url,
            catalog.released_at AS catalog_released_at,
            catalog.description_html AS catalog_description_html,
            catalog.rawg_rating AS catalog_rawg_rating,
            catalog.metacritic AS catalog_metacritic,
            catalog.rawg_playtime_hours AS catalog_playtime_hours,
            catalog.genres_json AS catalog_genres_json,
            catalog.metadata_quality AS catalog_metadata_quality,
            rawg.external_id::int AS catalog_rawg_id,
            game.how_long_to_beat AS game_hltb_hours,
            candidate.steam_name, candidate.steam_icon_url,
            to_jsonb(metadata_work) AS metadata_work,
            COUNT(*) OVER()::int AS total_count,
            COUNT(*) FILTER (WHERE COALESCE(catalog.name, game.name, candidate.steam_name, wishlist.display_name) ~ '^Steam App [0-9]+$') OVER()::int AS metadata_missing_count
       FROM user_wishlist_items wishlist
       LEFT JOIN LATERAL (
         SELECT membership.* FROM steam_wishlist_items membership
         WHERE membership.wishlist_item_id = wishlist.id AND membership.user_id = wishlist.user_id
         ORDER BY membership.is_active DESC, membership.provider_order ASC NULLS LAST,
           membership.last_seen_at DESC, membership.steam_app_id
         LIMIT 1
       ) steam ON TRUE
       LEFT JOIN games game ON game.id = wishlist.game_id AND game.user_id = wishlist.user_id
       LEFT JOIN catalog_games catalog ON catalog.id = wishlist.catalog_game_id
       LEFT JOIN external_game_ids rawg
         ON rawg.catalog_game_id = catalog.id AND rawg.source = 'rawg'
       LEFT JOIN steam_price_targets target ON target.wishlist_item_id = wishlist.id AND target.user_id = wishlist.user_id
       LEFT JOIN LATERAL (
         SELECT jsonb_build_object('epoch', m.epoch, 'lastError', m.last_error,
           'lastAttemptAt', m.last_attempt_at, 'nextAttemptAt', m.next_attempt_at,
           'observation', to_jsonb(o), 'lastKnown', (
             SELECT to_jsonb(priced) FROM steam_price_observations priced WHERE priced.monitor_id = m.id
               AND priced.current_minor IS NOT NULL ORDER BY priced.observed_at DESC, priced.id DESC LIMIT 1)) AS data
         FROM steam_price_monitors m LEFT JOIN steam_price_observations o ON o.id = m.latest_observation_id
         WHERE m.user_id = wishlist.user_id AND m.wishlist_item_id = wishlist.id
           AND (target.account_id IS NULL OR m.account_id = target.account_id)
           AND (target.steam_app_id IS NULL OR m.steam_app_id = target.steam_app_id)
         ORDER BY m.id DESC LIMIT 1
       ) price ON TRUE
      LEFT JOIN steam_import_candidates candidate ON candidate.user_id = wishlist.user_id AND candidate.steam_app_id = steam.steam_app_id
      LEFT JOIN wishlist_metadata_work metadata_work
        ON metadata_work.wishlist_item_id = wishlist.id AND metadata_work.user_id = wishlist.user_id
      WHERE ${where.join(" AND ")}
      ORDER BY ${order}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
    const health = await client.query(`SELECT
      COUNT(*) FILTER (WHERE t.reason = 'eligible')::int AS eligible,
      COUNT(*) FILTER (WHERE t.reason = 'eligible' AND m.latest_observation_id IS NOT NULL)::int AS observed,
      COUNT(*) FILTER (WHERE t.reason = 'eligible' AND m.last_error IS NOT NULL)::int AS failed,
      COUNT(*) FILTER (WHERE t.reason = 'eligible' AND m.last_error IN ('steam_price_offer_uncertain', 'steam_price_package_mismatch'))::int AS verification,
      COUNT(*) FILTER (WHERE t.reason = 'eligible' AND m.last_error = 'steam_price_unsupported_type')::int AS unsupported,
      COUNT(*) FILTER (WHERE t.reason = 'eligible' AND m.last_error IS NOT NULL AND m.last_error NOT IN ('steam_price_offer_uncertain', 'steam_price_package_mismatch', 'steam_price_unsupported_type'))::int AS retrying,
      COUNT(*) FILTER (WHERE t.reason = 'eligible' AND m.last_error IS NULL AND o.id IS NOT NULL AND m.next_attempt_at > NOW())::int AS awaiting_scheduled,
      COUNT(*) FILTER (WHERE t.reason = 'eligible' AND o.epoch = m.epoch AND o.observed_at >= NOW() - INTERVAL '36 hours' AND m.last_error IS NULL)::int AS fresh,
      COUNT(*) FILTER (WHERE t.reason = 'eligible' AND m.latest_observation_id IS NULL AND m.last_error IS NULL)::int AS unchecked,
      COUNT(*) FILTER (WHERE t.reason = 'identity_unresolved')::int AS unresolved,
      MAX(o.observed_at) AS last_observation_at
      FROM steam_price_targets t
      LEFT JOIN steam_price_monitors m ON m.account_id = t.account_id AND m.wishlist_item_id = t.wishlist_item_id AND m.steam_app_id = t.steam_app_id
      LEFT JOIN steam_price_observations o ON o.id = m.latest_observation_id
      WHERE t.user_id = $1`, [userId]);
    return {
      rows,
      account: await getSteamAccount(userId, client),
      priceHealth: health.rows[0],
      metadataHealth: await getWishlistMetadataStatus(userId, client),
    };
  });
  const items = rows.map((row) => serializeWishlistItem(row, { hltbLookup: options.hltbLookup }));
  return {
    account: serializeSteamAccount(account),
    items,
    snapshotVersion: account?.last_wishlist_sync_at || null,
    priceRevision: `${account?.id || 'disconnected'}:${account?.price_revision || 0}`,
    priceHealth,
    total: Number(rows[0]?.total_count) || 0,
    metadata: {
      missingNames: Number(rows[0]?.metadata_missing_count) || 0,
      complete: items.every((item) => item.metadataComplete),
      incompleteItems: items.filter((item) => !item.metadataComplete).length,
      ...(metadataHealth || {}),
    },
    limit,
    offset,
  };
}

async function resolveOppositeEvent(client, userId, appId, eventType) {
  await client.query(
    `UPDATE user_activity_events SET state = 'resolved', resolved_at = NOW()
      WHERE user_id = $1 AND source = $2 AND external_id = $3
        AND event_type = $4 AND state = 'open'`,
    [userId, SOURCE, appId, eventType],
  );
}

async function ensureWishlistItem(client, job, item) {
  const existing = await client.query(
    `SELECT wishlist_item_id FROM steam_wishlist_items WHERE user_id = $1 AND steam_app_id = $2`,
    [job.user_id, item.appid],
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE user_wishlist_items
          SET display_name = CASE
                WHEN $2::text IS NOT NULL AND (local_intent_source IS NULL OR display_name ~ '^Steam App [0-9]+$') THEN $2
                ELSE display_name
              END,
              cover_url = COALESCE($3, cover_url),
              release_date = COALESCE($4::date, release_date),
              tags_json = CASE WHEN jsonb_array_length($5::jsonb) > 0 THEN $5::jsonb ELSE tags_json END,
              updated_at = NOW()
        WHERE id = $1 AND user_id = $6`,
      [existing.rows[0].wishlist_item_id, item.name || null, item.coverUrl || null, item.releaseDate || null, JSON.stringify(item.genres || []), job.user_id],
    );
    const wishlistId = Number(existing.rows[0].wishlist_item_id);
    await client.query(
      `UPDATE user_wishlist_items wishlist SET catalog_game_id = external.catalog_game_id
       FROM external_game_ids external
       WHERE wishlist.id = $1 AND wishlist.user_id = $2 AND wishlist.catalog_game_id IS NULL
         AND external.source = 'steam' AND external.external_id = $3
         AND NOT EXISTS (SELECT 1 FROM user_wishlist_items other WHERE other.user_id = $2
           AND other.catalog_game_id = external.catalog_game_id AND other.id <> wishlist.id)`,
      [wishlistId, job.user_id, item.appid],
    );
    return wishlistId;
  }
  const identity = await client.query(
    `SELECT source.game_id, COALESCE(source.catalog_game_id, candidate.user_selected_catalog_game_id, external_id.catalog_game_id) AS catalog_game_id, game.name AS game_name, game.cover AS game_cover,
            catalog.name AS catalog_name, catalog.cover_url AS catalog_cover_url, catalog.released_at AS catalog_released_at,
            candidate.steam_name, candidate.steam_icon_url
       FROM (SELECT 1) seed
       LEFT JOIN user_game_sources source ON source.user_id = $1 AND source.provider = 'steam' AND source.provider_app_id = $2
       LEFT JOIN games game ON game.id = source.game_id AND game.user_id = $1
       LEFT JOIN steam_import_candidates candidate ON candidate.user_id = $1 AND candidate.steam_app_id = $2
       LEFT JOIN external_game_ids external_id ON external_id.source = 'steam' AND external_id.external_id = $2
       LEFT JOIN catalog_games catalog ON catalog.id = COALESCE(source.catalog_game_id, candidate.user_selected_catalog_game_id, external_id.catalog_game_id)
       LIMIT 1`,
    [job.user_id, item.appid],
  );
  const row = identity.rows[0] || {};
  const name = row.catalog_name || row.game_name || row.steam_name || item.name || `Steam App ${item.appid}`;
  const cover = row.catalog_cover_url || row.game_cover || row.steam_icon_url || item.coverUrl || null;
  const releaseDate = row.catalog_released_at || item.releaseDate || null;
  if (row.game_id) {
    const linked = await client.query(
      `INSERT INTO user_wishlist_items (user_id, game_id, catalog_game_id, display_name, cover_url, release_date, tags_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (user_id, game_id) WHERE game_id IS NOT NULL
       DO UPDATE SET catalog_game_id = COALESCE(user_wishlist_items.catalog_game_id, EXCLUDED.catalog_game_id),
                      display_name = EXCLUDED.display_name, cover_url = COALESCE(EXCLUDED.cover_url, user_wishlist_items.cover_url),
                      release_date = COALESCE(EXCLUDED.release_date, user_wishlist_items.release_date),
                      tags_json = CASE WHEN jsonb_array_length(EXCLUDED.tags_json) > 0 THEN EXCLUDED.tags_json ELSE user_wishlist_items.tags_json END,
                      updated_at = NOW()
       RETURNING id`,
      [job.user_id, row.game_id, row.catalog_game_id, name, cover, releaseDate, JSON.stringify(item.genres || [])],
    );
    return Number(linked.rows[0].id);
  }
  if (row.catalog_game_id) {
    const linked = await client.query(
      `INSERT INTO user_wishlist_items (user_id, catalog_game_id, display_name, cover_url, release_date, tags_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (user_id, catalog_game_id) WHERE catalog_game_id IS NOT NULL
       DO UPDATE SET display_name = EXCLUDED.display_name,
                      cover_url = COALESCE(EXCLUDED.cover_url, user_wishlist_items.cover_url),
                      release_date = COALESCE(EXCLUDED.release_date, user_wishlist_items.release_date),
                      tags_json = CASE WHEN jsonb_array_length(EXCLUDED.tags_json) > 0 THEN EXCLUDED.tags_json ELSE user_wishlist_items.tags_json END,
                      updated_at = NOW()
       RETURNING id`,
      [job.user_id, row.catalog_game_id, name, cover, releaseDate, JSON.stringify(item.genres || [])],
    );
    return Number(linked.rows[0].id);
  }
  const created = await client.query(
    `INSERT INTO user_wishlist_items (user_id, catalog_game_id, display_name, cover_url, release_date, tags_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
    [job.user_id, row.catalog_game_id, name, cover, releaseDate, JSON.stringify(item.genres || [])],
  );
  return Number(created.rows[0].id);
}

async function completeUnconfirmedEmpty(job, account, existingActive) {
  return withTransaction(async (client) => {
    if (!(await lockSteamSyncJob(client, job))) return null;
    const observations = existingActive ? 1 : Number(account.wishlist_empty_observations || 0) + 1;
    const run = await finishIntegrationSyncRun(job.sync_run_id, {
      status: "failed", errorsCount: 1,
      summary: { baselineAdvanced: false, emptyResponse: true },
      errorCode: "steam_wishlist_empty_unconfirmed",
      errorMessage: "Steam returned an empty or inaccessible wishlist. Confirm before removing saved membership.",
    }, client);
    const updated = await client.query(
      `UPDATE user_external_accounts SET wishlist_sync_status = 'empty_unconfirmed',
          last_wishlist_sync_attempt_at = NOW(), wishlist_empty_observations = $2,
          wishlist_empty_observed_at = NOW(), wishlist_last_error_code = 'steam_wishlist_empty_unconfirmed',
          wishlist_last_error_message = 'Steam returned an empty or inaccessible wishlist.', updated_at = NOW()
        WHERE id = $1 AND user_id = $3 RETURNING *`,
      [account.id, observations, job.user_id],
    );
    const result = { account: serializeSteamAccount(updated.rows[0]), needsEmptyConfirmation: true, total: 0, run: serializeIntegrationSyncRun(run) };
    await client.query(
      `UPDATE steam_sync_jobs SET status = 'completed', total = 0, cursor = 0, result_json = $2::jsonb,
          completed_at = NOW(), locked_at = NULL, lease_token = NULL, updated_at = NOW() WHERE id = $1`,
      [job.id, JSON.stringify(result)],
    );
    return result;
  });
}

export async function processSteamWishlistJob(job) {
  const account = await getSteamAccount(job.user_id);
  if (!account) throw badRequest("Linked Steam account no longer exists.");
  const active = await withTransaction(async (client) => {
    if (!(await lockSteamSyncJob(client, job))) return false;
    await client.query(
    `UPDATE user_external_accounts SET wishlist_sync_status = 'syncing', last_wishlist_sync_attempt_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND user_id = $2`,
    [account.id, job.user_id],
    );
    return true;
  });
  if (!active) return null;
  const snapshot = await fetchSteamWishlist(account.provider_user_id);
  const { rows: previous } = await pool.query(
    "SELECT * FROM steam_wishlist_items WHERE user_id = $1",
    [job.user_id],
  );
  const existingActive = previous.some((row) => row.is_active);
  if (!snapshot.items.length) {
    const evidenceAt = new Date(account.wishlist_empty_observed_at || 0).getTime();
    const recent = evidenceAt > 0 && Date.now() - evidenceAt <= EMPTY_EVIDENCE_MAX_AGE_MS;
    const establishedEmpty = !existingActive && Boolean(account.last_wishlist_sync_at);
    if (snapshot.emptyIsAmbiguous || (!establishedEmpty && !(job.force && recent))) {
      return completeUnconfirmedEmpty(job, account, existingActive);
    }
  }
  const diff = diffWishlistSnapshot(snapshot.items, previous);
  return withTransaction(async (client) => {
    if (!(await lockSteamSyncJob(client, job))) return null;
    const baselineExists = Boolean(account.last_wishlist_sync_at);
    for (const item of snapshot.items) {
      const wishlistItemId = await ensureWishlistItem(client, job, item);
      await client.query(
        `UPDATE user_wishlist_items SET metadata_provenance = metadata_provenance || jsonb_strip_nulls(jsonb_build_object(
           'cover', CASE WHEN $2::text IS NOT NULL THEN 'steam_store' END,
           'tags', CASE WHEN $3::boolean THEN 'steam_tags' END, 'observedAt', NOW())) WHERE id = $1`,
        [wishlistItemId, item.coverUrl || null, Boolean(item.genres?.length)],
      );
      const prior = previous.find((row) => String(row.steam_app_id) === item.appid);
      await client.query(
        `INSERT INTO steam_wishlist_items (user_id, account_id, wishlist_item_id, steam_app_id, priority, date_added, last_sync_run_id, provider_order, order_sync_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8::int IS NOT NULL THEN $7::bigint END)
         ON CONFLICT (user_id, steam_app_id) DO UPDATE SET account_id = EXCLUDED.account_id,
           wishlist_item_id = EXCLUDED.wishlist_item_id, priority = EXCLUDED.priority,
           provider_order = CASE WHEN steam_wishlist_items.account_id = EXCLUDED.account_id
             THEN COALESCE(EXCLUDED.provider_order, steam_wishlist_items.provider_order) ELSE EXCLUDED.provider_order END,
           order_sync_run_id = CASE WHEN steam_wishlist_items.account_id = EXCLUDED.account_id
             THEN COALESCE(EXCLUDED.order_sync_run_id, steam_wishlist_items.order_sync_run_id) ELSE EXCLUDED.order_sync_run_id END,
           date_added = CASE WHEN steam_wishlist_items.account_id = EXCLUDED.account_id
             THEN COALESCE(EXCLUDED.date_added, steam_wishlist_items.date_added) ELSE EXCLUDED.date_added END, is_active = TRUE,
           last_seen_at = NOW(), removed_at = NULL, removal_reason = NULL,
           last_changed_at = CASE WHEN steam_wishlist_items.is_active = FALSE OR steam_wishlist_items.priority IS DISTINCT FROM EXCLUDED.priority THEN NOW() ELSE steam_wishlist_items.last_changed_at END,
           last_sync_run_id = EXCLUDED.last_sync_run_id, updated_at = NOW()`,
        [job.user_id, account.id, wishlistItemId, item.appid, item.priority, item.dateAdded, job.sync_run_id, item.providerOrder ?? null],
      );
      await enqueueWishlistMetadataWork(client, {
        userId: job.user_id,
        wishlistItemId,
        steamAppId: item.appid,
      });
      if (baselineExists && (!prior || !prior.is_active)) {
        await resolveOppositeEvent(client, job.user_id, item.appid, "wishlist_removed");
        await resolveOppositeEvent(client, job.user_id, item.appid, "wishlist_likely_purchased");
        await createOpenActivityEvent({ userId: job.user_id, source: SOURCE, eventType: "wishlist_added", wishlistItemId, externalId: item.appid, syncRunId: job.sync_run_id, dedupeKey: `added:${item.appid}:${item.dateAdded || job.sync_run_id}`, payload: { priority: item.priority, dateAdded: item.dateAdded } }, client);
      }
    }
    const priorityChanges = [];
    for (const removed of diff.removed) {
      const owned = await client.query(
        `SELECT source.first_imported_at, source.last_synced_at, run.started_at AS ownership_observed_at
          FROM user_game_sources source JOIN integration_sync_runs run ON run.id = source.ownership_observed_run_id
          WHERE source.user_id = $1 AND source.provider = 'steam' AND source.provider_app_id = $2
            AND source.source_status = 'owned' AND run.user_id = $1
            AND run.status IN ('succeeded', 'partial') AND run.summary_json->>'baseline' = 'false' LIMIT 1`,
        [job.user_id, removed.steam_app_id],
      );
      const source = owned.rows[0];
      const likelyPurchased = Boolean(source && account.last_wishlist_sync_at &&
        new Date(source.ownership_observed_at) > new Date(account.last_wishlist_sync_at) &&
        new Date(source.last_synced_at || 0) >= new Date(account.last_wishlist_sync_at));
      const reason = likelyPurchased ? "likely_purchased" : "removed_from_steam";
      await client.query(
        `UPDATE steam_wishlist_items SET is_active = FALSE, removed_at = NOW(), removal_reason = $3,
            last_changed_at = NOW(), last_sync_run_id = $4, updated_at = NOW()
          WHERE user_id = $1 AND steam_app_id = $2`,
        [job.user_id, removed.steam_app_id, reason, job.sync_run_id],
      );
      await resolveOppositeEvent(client, job.user_id, removed.steam_app_id, "wishlist_added");
      if (baselineExists) await createOpenActivityEvent({ userId: job.user_id, source: SOURCE, eventType: likelyPurchased ? "wishlist_likely_purchased" : "wishlist_removed", wishlistItemId: removed.wishlist_item_id, externalId: removed.steam_app_id, syncRunId: job.sync_run_id, dedupeKey: `${reason}:${removed.steam_app_id}:${job.sync_run_id}`, payload: { previousPriority: removed.priority } }, client);
    }
    for (const change of diff.priorityChanged) priorityChanges.push({ steamAppId: change.item.appid, from: change.previousPriority, to: change.item.priority });
    if (baselineExists && priorityChanges.length) {
      await createOpenActivityEvent({ userId: job.user_id, source: SOURCE, eventType: "wishlist_priority_changed", syncRunId: job.sync_run_id, dedupeKey: `priority:${job.sync_run_id}`, payload: { changes: priorityChanges } }, client);
    }
    const metadata = snapshot.metadata || {
      expected: snapshot.items.length,
      named: snapshot.items.filter((item) => item.name).length,
      covered: snapshot.items.filter((item) => item.coverUrl).length,
      failedPages: [],
      complete: snapshot.items.every((item) => item.name && absoluteImageUrl(item.coverUrl) && item.genres?.length),
    };
    const runStatus = metadata.complete ? "succeeded" : "partial";
    const accountStatus = snapshot.items.length
      ? (metadata.complete ? "synced" : "partial")
      : "empty";
    const accountRows = await client.query(
      `UPDATE user_external_accounts SET wishlist_sync_status = $2, last_wishlist_sync_attempt_at = NOW(),
          last_wishlist_sync_at = NOW(), wishlist_last_error_code = NULL, wishlist_last_error_message = NULL,
          wishlist_empty_observations = 0, wishlist_empty_observed_at = NULL, updated_at = NOW()
        WHERE id = $1 AND user_id = $3 RETURNING *`,
      [account.id, accountStatus, job.user_id],
    );
    const summary = {
      total: snapshot.items.length,
      added: baselineExists ? diff.added.length : 0,
      removed: diff.removed.length,
      priorityChanged: priorityChanges.length,
      baselineAdvanced: true,
      metadata,
    };
    const run = await finishIntegrationSyncRun(job.sync_run_id, { status: runStatus, itemsSeen: snapshot.items.length, itemsChanged: summary.added + summary.removed + summary.priorityChanged, summary }, client);
    const result = { account: serializeSteamAccount(accountRows.rows[0]), total: snapshot.items.length, summary, run: serializeIntegrationSyncRun(run) };
    await client.query(
      `UPDATE steam_sync_jobs SET status = 'completed', total = $2, cursor = $2, payload_json = NULL,
          result_json = $3::jsonb, completed_at = NOW(), locked_at = NULL, lease_token = NULL, updated_at = NOW() WHERE id = $1`,
      [job.id, snapshot.items.length, JSON.stringify(result)],
    );
    return result;
  });
}

export async function failSteamWishlistJob(job, error) {
  if (!job?.lease_token) return;
  await withTransaction(async (client) => {
    if (!(await lockSteamSyncJob(client, job))) return;
    const code = error?.code || "steam_wishlist_sync_failed";
    const message = error?.message || "Steam wishlist sync failed.";
    if (job.sync_run_id) await finishIntegrationSyncRun(job.sync_run_id, { status: "failed", errorsCount: 1, summary: { baselineAdvanced: false }, errorCode: code, errorMessage: message }, client);
    await client.query("UPDATE steam_sync_jobs SET status = 'failed', error_code = $2, error_message = $3, completed_at = NOW(), locked_at = NULL, lease_token = NULL, updated_at = NOW() WHERE id = $1", [job.id, code, message]);
    await client.query("UPDATE user_external_accounts SET wishlist_sync_status = 'failed', last_wishlist_sync_attempt_at = NOW(), wishlist_last_error_code = $2, wishlist_last_error_message = $3, updated_at = NOW() WHERE id = $1 AND user_id = $4 AND disconnected_at IS NULL", [job.account_id, code, message, job.user_id]);
  });
}

export async function moveWishlistItemToBacklog(userId, wishlistItemId, status) {
  return withTransaction(async (client) => {
    const item = await client.query("SELECT * FROM user_wishlist_items WHERE id = $1 AND user_id = $2 FOR UPDATE", [wishlistItemId, userId]);
    if (!item.rows[0]) throw notFound("Wishlist item not found.");
    const valid = await client.query("SELECT status FROM statuses WHERE status = $1 AND LOWER(TRIM(status)) <> 'wishlist'", [status]);
    if (!valid.rows[0]) throw badRequest("Choose a backlog lifecycle status.");
    let gameId = item.rows[0].game_id;
    if (gameId) {
      await client.query("UPDATE games SET status = $3 WHERE id = $1 AND user_id = $2 AND LOWER(TRIM(status)) = 'wishlist'", [gameId, userId, status]);
    } else {
      const duplicate = await client.query(
        `SELECT id FROM games WHERE user_id = $1 AND (
           ($2::int IS NOT NULL AND catalog_game_id = $2) OR
           normalize_game_title_sql(name) = normalize_game_title_sql($3)
         ) ORDER BY (catalog_game_id = $2) DESC NULLS LAST, id LIMIT 1`,
        [userId, item.rows[0].catalog_game_id, item.rows[0].display_name],
      );
      if (duplicate.rows[0]) gameId = duplicate.rows[0].id;
      else {
        const created = await client.query(
          `INSERT INTO games (user_id, catalog_game_id, name, status, cover, position)
           VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(position) + 1 FROM games WHERE user_id = $1 AND status = $4), 0)) RETURNING id`,
          [userId, item.rows[0].catalog_game_id, item.rows[0].display_name, status, item.rows[0].cover_url],
        );
        gameId = created.rows[0].id;
      }
      await client.query("UPDATE user_wishlist_items SET game_id = $2, updated_at = NOW() WHERE id = $1", [wishlistItemId, gameId]);
      await client.query(
        `UPDATE user_game_sources source SET game_id = $2, updated_at = NOW()
          FROM steam_wishlist_items steam
         WHERE steam.wishlist_item_id = $1 AND steam.user_id = $3
           AND source.user_id = $3 AND source.provider = 'steam'
           AND source.provider_app_id = steam.steam_app_id AND source.game_id IS NULL`,
        [wishlistItemId, gameId, userId],
      );
    }
    return { gameId: Number(gameId), wishlistItemId: Number(wishlistItemId) };
  });
}

// Explicit local-intention retirement after the owned game has been added/linked.
// This never changes Steam membership, personal status or dates.
export async function retireOwnedWishlistIntention(userId, wishlistItemId, gameId) {
  await assertSavedAccountUser(userId);
  return withTransaction(async (client) => {
    await client.query(`SELECT id FROM user_external_accounts
      WHERE user_id = $1 AND provider = 'steam' AND disconnected_at IS NULL FOR UPDATE`, [userId]);
    const { rows } = await client.query(`UPDATE user_wishlist_items w
      SET local_intent_active = FALSE, updated_at = NOW()
      WHERE w.id = $2 AND w.user_id = $1 AND EXISTS (
        SELECT 1 FROM steam_price_targets t
        JOIN user_external_accounts a ON a.id = t.account_id AND a.user_id = t.user_id
          AND a.provider = 'steam' AND a.disconnected_at IS NULL
        JOIN user_game_sources s ON s.user_id = t.user_id AND s.provider = 'steam'
          AND s.provider_app_id = t.steam_app_id AND s.source_status = 'owned' AND s.last_synced_at >= a.linked_at
        JOIN games g ON g.id = s.game_id AND g.user_id = s.user_id AND LOWER(TRIM(g.status)) <> 'wishlist'
        WHERE t.user_id = w.user_id AND t.wishlist_item_id = w.id AND t.reason IN ('owned', 'removed') AND g.id = $3
      ) RETURNING w.id`, [userId, wishlistItemId, gameId]);
    if (!rows[0]) throw badRequest('Add or link this owned game to your Backlog before removing its local Wishlist intention.');
    return { wishlistItemId: Number(rows[0].id), localActive: false };
  });
}
