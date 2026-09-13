import crypto from "node:crypto";
import { pool } from "../db.js";
import { searchCatalog } from "./catalogService.js";
import { ingestRawgGameMetadata } from "./metadataIngestionService.js";
import { isSameGameTitle } from "../utils/gameTitle.js";
import { notFound } from "../utils/httpError.js";

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 10;
const LEASE_MS = 2 * 60 * 1000;
const INCOMPLETE_RETRY_MS = 3 * 24 * 60 * 60 * 1000;
const INCOMPLETE_WEEKLY_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const MATURE_REFRESH_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 8;
const METADATA_JOB_TYPE = "wishlist_metadata";

function positiveInt(value, fallback, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function wishlistCatalogMetadataComplete(game) {
  return game?.metadata_quality === "full" &&
    Boolean(cleanString(game?.cover_url)) &&
    jsonArray(game?.genres_json).length > 0;
}

export function nextWishlistMetadataAttempt({
  releasedAt,
  metadataComplete = false,
  attemptCount = 0,
  now = new Date(),
} = {}) {
  const base = validDate(now) || new Date();
  if (!metadataComplete) {
    const delay = Number(attemptCount) <= 1
      ? INCOMPLETE_RETRY_MS
      : INCOMPLETE_WEEKLY_RETRY_MS;
    return new Date(base.getTime() + delay);
  }
  const released = validDate(releasedAt);
  const recentCutoff = new Date(base.getTime() - 365 * 24 * 60 * 60 * 1000);
  return new Date(
    base.getTime() +
      (released && released >= recentCutoff ? RECENT_REFRESH_MS : MATURE_REFRESH_MS),
  );
}

export function metadataWorkStatus(row) {
  if (!row) return "pending";
  if (row.status === "review") return "review";
  if (row.status === "unmatched") return "unmatched";
  if (row.status === "failed") return "failed";
  if (row.status === "completed") return "complete";
  return "pending";
}

export function serializeWishlistMetadataWork(row) {
  if (!row) return null;
  return {
    status: metadataWorkStatus(row),
    identityState: row.identity_state || "unresolved",
    issue: row.identity_reason || row.last_error_code || null,
    candidates: jsonArray(row.candidates_json),
    nextAttemptAt: row.next_attempt_at || null,
    lastAttemptAt: row.last_attempt_at || null,
    attemptCount: Number(row.attempt_count || 0),
  };
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function serializeMetadataRun(row) {
  if (!row) return null;
  const parameters = jsonObject(row.parameters_json);
  return {
    id: Number(row.id),
    status: row.status,
    trigger: parameters.trigger || "manual",
    requestedMaxItems: Number(parameters.maxItems || 0),
    processed: Number(row.processed_count || 0),
    completed: Number(row.linked_count || 0),
    review: Number(row.review_count || 0),
    unmatched: Number(row.unmatched_count || 0),
    failed: Number(row.failed_count || 0),
    createdAt: row.created_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    lastErrorCode: row.last_error_code || null,
    lastErrorMessage: row.last_error_message || null,
  };
}

async function startMetadataRun(db, userId, maxItems, trigger = "manual") {
  const { rows } = await db.query(
    `INSERT INTO metadata_jobs (
       job_type, scope_user_id, requested_by_user_id, status,
       parameters_json, cursor_json, next_attempt_at, started_at
     ) VALUES ($1, $2, $2, 'running', $3::jsonb, '{}'::jsonb, NOW(), NOW())
     RETURNING *`,
    [METADATA_JOB_TYPE, userId, JSON.stringify({ maxItems, trigger })],
  );
  return rows[0] || null;
}

async function recordMetadataAttempt(db, runId, userId, result) {
  if (!runId || !result?.wishlistItemId) return;
  await db.query(
    `INSERT INTO wishlist_metadata_attempts (
       metadata_job_id, user_id, wishlist_item_id, status, identity_state,
       issue, error_code, candidate_count, attempted_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      runId,
      userId,
      result.wishlistItemId,
      result.status,
      result.identityState || null,
      result.issue || null,
      result.errorCode || null,
      result.candidateCount == null ? null : Number(result.candidateCount),
    ],
  );
  await db.query(
    `UPDATE metadata_jobs
        SET processed_count = processed_count + 1,
            linked_count = linked_count + $2,
            review_count = review_count + $3,
            unmatched_count = unmatched_count + $4,
            failed_count = failed_count + $5,
            last_error_code = COALESCE($6, last_error_code),
            last_error_message = COALESCE($7, last_error_message),
            updated_at = NOW()
      WHERE id = $1 AND job_type = $8 AND scope_user_id = $9`,
    [
      runId,
      result.status === "completed" ? 1 : 0,
      result.status === "review" ? 1 : 0,
      result.status === "unmatched" ? 1 : 0,
      result.status === "failed" ? 1 : 0,
      result.errorCode || null,
      result.errorMessage || null,
      METADATA_JOB_TYPE,
      userId,
    ],
  );
}

async function finishMetadataRun(db, runId, status = "completed", error = null) {
  if (!runId) return null;
  const { rows } = await db.query(
    `UPDATE metadata_jobs
        SET status = $2,
            total_count = processed_count,
            completed_at = NOW(),
            next_attempt_at = NULL,
            worker_id = NULL,
            lease_expires_at = NULL,
            last_error_code = COALESCE($3, last_error_code),
            last_error_message = COALESCE($4, last_error_message),
            updated_at = NOW()
      WHERE id = $1 AND job_type = $5
      RETURNING *`,
    [runId, status, error?.code || null, error?.message || null, METADATA_JOB_TYPE],
  );
  return rows[0] || null;
}

export async function listWishlistMetadataRuns(userId, db = pool, limit = 10) {
  const { rows } = await db.query(
    `SELECT * FROM metadata_jobs
      WHERE job_type = $1 AND scope_user_id = $2
      ORDER BY id DESC LIMIT $3`,
    [METADATA_JOB_TYPE, userId, Math.min(Math.max(Number(limit) || 10, 1), 50)],
  );
  return rows.map(serializeMetadataRun);
}

export async function enqueueWishlistMetadataWork(
  db,
  { userId, wishlistItemId, steamAppId = null } = {},
) {
  if (!db || !userId || !wishlistItemId) return null;
  const { rows } = await db.query(
    `INSERT INTO wishlist_metadata_work (
       wishlist_item_id, user_id, steam_app_id, status, next_attempt_at
     ) VALUES ($1, $2, $3, 'queued', NOW())
     ON CONFLICT (wishlist_item_id) DO UPDATE SET
       steam_app_id = COALESCE(EXCLUDED.steam_app_id, wishlist_metadata_work.steam_app_id),
       next_attempt_at = CASE
         WHEN wishlist_metadata_work.status IN ('completed', 'failed', 'unmatched')
           AND wishlist_metadata_work.next_attempt_at IS NULL THEN NOW()
         ELSE wishlist_metadata_work.next_attempt_at
       END,
       updated_at = NOW()
     RETURNING *`,
    [wishlistItemId, userId, steamAppId ? String(steamAppId) : null],
  );
  return rows[0] || null;
}

export async function ensureWishlistMetadataWorkForUser(userId, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO wishlist_metadata_work (wishlist_item_id, user_id, steam_app_id, next_attempt_at)
     SELECT wishlist.id, wishlist.user_id, steam.steam_app_id, NOW()
       FROM user_wishlist_items wishlist
       LEFT JOIN LATERAL (
         SELECT steam_app_id FROM steam_wishlist_items membership
          WHERE membership.wishlist_item_id = wishlist.id
            AND membership.user_id = wishlist.user_id
          ORDER BY membership.is_active DESC, membership.last_seen_at DESC, membership.steam_app_id
          LIMIT 1
       ) steam ON TRUE
      WHERE wishlist.user_id = $1
     ON CONFLICT (wishlist_item_id) DO NOTHING
     RETURNING wishlist_item_id`,
    [userId],
  );
  return rows.length;
}

export async function getWishlistMetadataStatus(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE work.status IS NULL OR work.status IN ('queued', 'running'))::int AS pending,
       COUNT(*) FILTER (WHERE work.status = 'review')::int AS review,
       COUNT(*) FILTER (WHERE work.status = 'unmatched')::int AS unmatched,
       COUNT(*) FILTER (WHERE work.status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE work.status = 'completed')::int AS complete,
       MAX(work.last_attempt_at) AS last_attempt_at,
       MIN(work.next_attempt_at) FILTER (WHERE work.next_attempt_at IS NOT NULL) AS next_attempt_at
      FROM user_wishlist_items wishlist
      LEFT JOIN wishlist_metadata_work work
        ON work.wishlist_item_id = wishlist.id AND work.user_id = wishlist.user_id
     WHERE wishlist.user_id = $1`,
    [userId],
  );
  const row = rows[0] || {};
  return {
    total: Number(row.total || 0),
    pending: Number(row.pending || 0),
    review: Number(row.review || 0),
    unmatched: Number(row.unmatched || 0),
    failed: Number(row.failed || 0),
    complete: Number(row.complete || 0),
    lastAttemptAt: row.last_attempt_at || null,
    nextAttemptAt: row.next_attempt_at || null,
    recentRuns: await listWishlistMetadataRuns(userId, db),
  };
}

async function claimWork(db, workerId, userId = null, wishlistItemId = null) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query(
      `SELECT * FROM wishlist_metadata_work
        WHERE ($1::int IS NULL OR user_id = $1)
          AND ($2::bigint IS NULL OR wishlist_item_id = $2)
          AND status IN ('queued', 'completed', 'failed', 'unmatched')
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
        ORDER BY next_attempt_at NULLS FIRST, updated_at, wishlist_item_id
        FOR UPDATE SKIP LOCKED LIMIT 1`,
      [userId == null ? null : Number(userId), wishlistItemId == null ? null : Number(wishlistItemId)],
    );
    if (!claimed.rows[0]) {
      await client.query("COMMIT");
      return null;
    }
    const updated = await client.query(
      `UPDATE wishlist_metadata_work
          SET status = 'running', worker_id = $2,
              lease_expires_at = NOW() + ($3::int * INTERVAL '1 millisecond'),
              attempt_count = attempt_count + 1, last_attempt_at = NOW(), updated_at = NOW()
        WHERE wishlist_item_id = $1
        RETURNING *`,
      [claimed.rows[0].wishlist_item_id, workerId, LEASE_MS],
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function loadWork(work, db) {
  const { rows } = await db.query(
    `SELECT work.*, wishlist.display_name, wishlist.cover_url,
            wishlist.release_date, wishlist.catalog_game_id, wishlist.user_id,
            steam.steam_app_id, catalog.name AS catalog_name,
            catalog.cover_url AS catalog_cover_url, catalog.released_at,
            catalog.metadata_quality, catalog.genres_json,
            rawg.external_id AS rawg_id
       FROM wishlist_metadata_work work
       JOIN user_wishlist_items wishlist
         ON wishlist.id = work.wishlist_item_id AND wishlist.user_id = work.user_id
       LEFT JOIN LATERAL (
         SELECT membership.steam_app_id FROM steam_wishlist_items membership
          WHERE membership.wishlist_item_id = wishlist.id
            AND membership.user_id = wishlist.user_id
          ORDER BY membership.is_active DESC, membership.last_seen_at DESC, membership.steam_app_id
          LIMIT 1
       ) steam ON TRUE
       LEFT JOIN catalog_games catalog ON catalog.id = wishlist.catalog_game_id
       LEFT JOIN external_game_ids rawg
         ON rawg.catalog_game_id = catalog.id AND rawg.source = 'rawg'
      WHERE work.wishlist_item_id = $1 AND work.user_id = $2`,
    [work.wishlist_item_id, work.user_id],
  );
  return rows[0] || null;
}

async function loadCatalog(catalogGameId, db) {
  const { rows } = await db.query(
    `SELECT catalog.id AS catalog_game_id, catalog.cover_url,
            catalog.released_at, catalog.metadata_quality, catalog.genres_json,
            rawg.external_id AS rawg_id
       FROM catalog_games catalog
       LEFT JOIN external_game_ids rawg
         ON rawg.catalog_game_id = catalog.id AND rawg.source = 'rawg'
      WHERE catalog.id = $1
      LIMIT 1`,
    [Number(catalogGameId)],
  );
  return rows[0] || null;
}

function candidateFromResult(candidate) {
  const rawgId = Number(candidate?.rawg_id ?? candidate?.rawgId);
  const catalogId = Number(candidate?.catalog_game_id ?? candidate?.id);
  const name = cleanString(candidate?.name);
  if (!Number.isInteger(rawgId) || rawgId <= 0 || !Number.isInteger(catalogId) || catalogId <= 0 || !name) return null;
  return {
    catalogGameId: catalogId,
    rawgId,
    name,
    released: candidate?.released || null,
    cover: candidate?.cover || null,
  };
}

function uniqueCandidates(results) {
  const seen = new Set();
  return (Array.isArray(results) ? results : [])
    .map(candidateFromResult)
    .filter((candidate) => {
      if (!candidate || seen.has(candidate.rawgId)) return false;
      seen.add(candidate.rawgId);
      return true;
    })
    .slice(0, MAX_CANDIDATES);
}

async function exactCatalogForSteam(work, db) {
  if (work.catalog_game_id) return Number(work.catalog_game_id);
  if (!work.steam_app_id) return null;
  const { rows } = await db.query(
    `SELECT external.catalog_game_id
       FROM external_game_ids external
      WHERE external.source = 'steam' AND external.external_id = $1
      LIMIT 1`,
    [String(work.steam_app_id)],
  );
  return rows[0]?.catalog_game_id ? Number(rows[0].catalog_game_id) : null;
}

async function linkCatalog(work, catalogGameId, db) {
  const { rows } = await db.query(
    `UPDATE user_wishlist_items wishlist
        SET catalog_game_id = $3, updated_at = NOW()
      WHERE wishlist.id = $1 AND wishlist.user_id = $2
        AND (wishlist.catalog_game_id = $3 OR NOT EXISTS (
          SELECT 1 FROM user_wishlist_items other
           WHERE other.user_id = $2 AND other.catalog_game_id = $3 AND other.id <> $1
        ))
      RETURNING id`,
    [work.wishlist_item_id, work.user_id, Number(catalogGameId)],
  );
  if (!rows[0]) {
    const error = new Error("A different Wishlist item already uses this catalog identity.");
    error.code = "wishlist_identity_conflict";
    throw error;
  }
}

async function updateWork(work, values, db) {
  await db.query(
    `UPDATE wishlist_metadata_work
        SET status = $2, identity_state = $3, identity_reason = $4,
            candidates_json = $5::jsonb, metadata_due_reason = $6,
            next_attempt_at = $7, completed_at = $8,
            last_error_code = $9, last_error_message = $10,
            worker_id = NULL, lease_expires_at = NULL, updated_at = NOW()
      WHERE wishlist_item_id = $1 AND user_id = $11`,
    [
      work.wishlist_item_id, values.status, values.identityState, values.reason || null,
      JSON.stringify(values.candidates || []), values.dueReason || null,
      values.nextAttemptAt || null, values.completedAt || null,
      values.errorCode || null, values.errorMessage || null, work.user_id,
    ],
  );
}

async function processWork(work, dependencies) {
  const db = dependencies.db;
  const row = await loadWork(work, db);
  if (!row) return { status: "unmatched", reason: "wishlist_item_missing" };
  const now = dependencies.now();
  const title = row.catalog_name || row.display_name;
  let catalogId = await exactCatalogForSteam(row, db);

  if (!catalogId) {
    const rawgSearch = await dependencies.searchCatalog(title, {
      id: row.user_id,
      is_guest: false,
    });
    const candidates = uniqueCandidates(rawgSearch?.results);
    const exact = candidates.filter((candidate) => isSameGameTitle(title, candidate.name));
    if (exact.length !== 1) {
      const status = exact.length > 1 ? "review" : "unmatched";
      await updateWork(row, {
        status,
        identityState: exact.length > 1 ? "ambiguous" : "unresolved",
        reason: exact.length > 1 ? "multiple_exact_title_candidates" : "no_safe_title_match",
        candidates,
        dueReason: status === "unmatched" ? "identity_retry" : "identity_review",
        nextAttemptAt: status === "unmatched"
          ? nextWishlistMetadataAttempt({ releasedAt: row.release_date, attemptCount: row.attempt_count, now })
          : null,
      }, db);
      return {
        status,
        identityState: exact.length > 1 ? "ambiguous" : "unresolved",
        issue: exact.length > 1 ? "multiple_exact_title_candidates" : "no_safe_title_match",
        candidateCount: candidates.length,
      };
    }
    catalogId = exact[0].catalogGameId;
  }

  let catalog = await loadCatalog(catalogId, db);
  let rawgId = catalog?.rawg_id ? Number(catalog.rawg_id) : null;
  if (!rawgId) {
    const rawgSearch = await dependencies.searchCatalog(title, {
      id: row.user_id,
      is_guest: false,
    });
    const candidates = uniqueCandidates(rawgSearch?.results)
      .filter((candidate) => candidate.catalogGameId === Number(catalogId) || isSameGameTitle(title, candidate.name));
    const exact = candidates.filter((candidate) => isSameGameTitle(title, candidate.name));
    if (exact.length !== 1) {
      const status = exact.length > 1 ? "review" : "unmatched";
      await updateWork(row, {
        status,
        identityState: status === "review" ? "ambiguous" : "unresolved",
        reason: status === "review" ? "multiple_rawg_identity_candidates" : "rawg_identity_missing",
        candidates,
        dueReason: status === "review" ? "identity_review" : "identity_retry",
        nextAttemptAt: status === "review"
          ? null
          : nextWishlistMetadataAttempt({ releasedAt: row.release_date, attemptCount: row.attempt_count, now }),
      }, db);
      return {
        status,
        identityState: status === "review" ? "ambiguous" : "unresolved",
        issue: status === "review" ? "multiple_rawg_identity_candidates" : "rawg_identity_missing",
        candidateCount: candidates.length,
      };
    }
    rawgId = exact[0].rawgId;
    catalogId = exact[0].catalogGameId;
  }

  if (!catalog || Number(catalog.catalog_game_id) !== Number(catalogId)) {
    catalog = await loadCatalog(catalogId, db);
  }
  if (!catalog || Number(catalog.catalog_game_id) !== Number(catalogId)) {
    const result = await dependencies.ingestRawgGameMetadata(rawgId, { force: false });
    catalog = result.catalogGame;
  } else if (!wishlistCatalogMetadataComplete(catalog)) {
    await dependencies.ingestRawgGameMetadata(rawgId, { force: false });
    catalog = await loadCatalog(catalogId, db);
  }

  await linkCatalog(row, catalogId, db);
  const complete = wishlistCatalogMetadataComplete(catalog);
  await updateWork(row, {
    status: complete ? "completed" : "unmatched",
    identityState: "exact",
    reason: complete ? "safe_rawg_identity" : "rawg_metadata_incomplete",
    dueReason: complete ? "catalog_refresh" : "metadata_retry",
    nextAttemptAt: nextWishlistMetadataAttempt({
      releasedAt: catalog?.released_at || row.release_date,
      metadataComplete: complete,
      attemptCount: row.attempt_count,
      now,
    }),
    completedAt: complete ? now : null,
  }, db);
  return {
    status: complete ? "completed" : "unmatched",
    identityState: "exact",
    issue: complete ? null : "rawg_metadata_incomplete",
    catalogGameId: catalogId,
  };
}

export async function processNextWishlistMetadataBatch({
  db = pool,
  userId = null,
  wishlistItemId = null,
  workerId = `wishlist-metadata-${process.pid}-${crypto.randomUUID()}`,
  searchCatalogFn = searchCatalog,
  ingestRawgGameMetadataFn = ingestRawgGameMetadata,
  now = () => new Date(),
} = {}) {
  const work = await claimWork(db, workerId, userId, wishlistItemId);
  if (!work) return null;
  const dependencies = {
    db,
    now,
    searchCatalog: searchCatalogFn,
    ingestRawgGameMetadata: ingestRawgGameMetadataFn,
  };
  try {
    const outcome = await processWork(work, dependencies);
    return { processed: 1, wishlistItemId: Number(work.wishlist_item_id), ...outcome };
  } catch (error) {
    const retryAt = nextWishlistMetadataAttempt({
      releasedAt: work.release_date,
      attemptCount: work.attempt_count,
      now: now(),
    });
    await updateWork(work, {
      status: "failed",
      identityState: "unresolved",
      reason: "provider_or_persistence_failure",
      dueReason: "retry_backoff",
      nextAttemptAt: retryAt,
      errorCode: String(error?.code || "wishlist_metadata_failed"),
      errorMessage: String(error?.message || "Wishlist metadata refresh failed."),
    }, db);
    return {
      processed: 1,
      wishlistItemId: Number(work.wishlist_item_id),
      status: "failed",
      identityState: "unresolved",
      errorCode: String(error?.code || "wishlist_metadata_failed"),
      errorMessage: String(error?.message || "Wishlist metadata refresh failed."),
    };
  }
}

export async function drainWishlistMetadataQueue({
  userId,
  db = pool,
  maxItems = DEFAULT_BATCH_SIZE,
  runId = null,
  ...options
} = {}) {
  const limit = positiveInt(maxItems, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await processNextWishlistMetadataBatch({ db, userId, ...options });
    if (!result) break;
    results.push(result);
    await recordMetadataAttempt(db, runId, userId, result);
  }
  return { processed: results.length, results };
}

export async function refreshWishlistMetadata(userId, options = {}) {
  const db = options.db || pool;
  const maxItems = options.maxItems ?? DEFAULT_BATCH_SIZE;
  const run = await startMetadataRun(db, userId, maxItems, options.trigger);
  try {
    await ensureWishlistMetadataWorkForUser(userId, db);
    const drain = await drainWishlistMetadataQueue({
      ...options,
      db,
      userId,
      runId: run?.id,
      maxItems,
    });
    const finished = await finishMetadataRun(db, run?.id);
    return { ...(await getWishlistMetadataStatus(userId, db)), drain, run: serializeMetadataRun(finished) };
  } catch (error) {
    await finishMetadataRun(db, run?.id, "failed", error);
    throw error;
  }
}

export async function refreshWishlistMetadataItem(userId, wishlistItemId, options = {}) {
  const db = options.db || pool;
  const itemId = Number(wishlistItemId);
  const { rows } = await db.query(
    "SELECT id FROM user_wishlist_items WHERE id = $1 AND user_id = $2",
    [itemId, userId],
  );
  if (!rows[0]) throw notFound("Wishlist item not found.");
  const run = await startMetadataRun(db, userId, 1, "item");
  try {
    await ensureWishlistMetadataWorkForUser(userId, db);
    await db.query(
      `UPDATE wishlist_metadata_work
          SET status = 'queued', identity_state = 'unresolved', identity_reason = NULL,
              candidates_json = '[]'::jsonb, next_attempt_at = NOW(), completed_at = NULL,
              last_error_code = NULL, last_error_message = NULL,
              worker_id = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE wishlist_item_id = $1 AND user_id = $2`,
      [itemId, userId],
    );
    const drain = await drainWishlistMetadataQueue({
      ...options,
      db,
      userId,
      wishlistItemId: itemId,
      runId: run?.id,
      maxItems: 1,
    });
    const finished = await finishMetadataRun(db, run?.id);
    return { ...(await getWishlistMetadataStatus(userId, db)), drain, run: serializeMetadataRun(finished) };
  } catch (error) {
    await finishMetadataRun(db, run?.id, "failed", error);
    throw error;
  }
}
