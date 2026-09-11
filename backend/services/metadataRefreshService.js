import crypto from "node:crypto";
import { pool } from "../db.js";
import { ingestRawgGameMetadata } from "./metadataIngestionService.js";
import {
  nextCatalogRefreshAt,
  nextCatalogRefreshRetryAt,
  CATALOG_REFRESH_DUE_SQL,
} from "./metadataSchedule.js";

export { nextCatalogRefreshAt, nextCatalogRefreshRetryAt };

const JOB_TYPE = "catalog_refresh";
const DEFAULT_BATCH_SIZE = 2;
const DEFAULT_PROVIDER_BUDGET = 25;
const DEFAULT_MAX_ITEMS = 25;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;

function positiveInt(value, fallback, max, min = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min
    ? Math.min(parsed, max)
    : fallback;
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function serializeJob(row) {
  if (!row) return null;
  const parameters = jsonObject(row.parameters_json);
  const cursor = jsonObject(row.cursor_json);
  return {
    id: Number(row.id),
    status: row.status,
    totalCount: Number(row.total_count || 0),
    processedCount: Number(row.processed_count || 0),
    refreshedCount: Number(row.linked_count || 0),
    failedCount: Number(row.failed_count || 0),
    providerBudget: Number(parameters.providerBudget || 0),
    providerRequests: Number(cursor.providerRequests || 0),
    createdAt: row.created_at,
    completedAt: row.completed_at || null,
  };
}

function trackedCatalogSql(userParam = null) {
  return `(
  EXISTS (
    SELECT 1 FROM games linked_game
     WHERE linked_game.catalog_game_id = catalog.id
       AND LOWER(TRIM(linked_game.status)) <> 'wishlist'
       ${userParam ? `AND linked_game.user_id = ${userParam}` : ""}
  )
  OR EXISTS (
    SELECT 1 FROM user_wishlist_items wishlist
     WHERE wishlist.catalog_game_id = catalog.id
       ${userParam ? `AND wishlist.user_id = ${userParam}` : ""}
       AND (wishlist.local_intent_active OR EXISTS (
         SELECT 1 FROM steam_wishlist_items membership
         JOIN user_external_accounts account ON account.id = membership.account_id
           AND account.user_id = wishlist.user_id AND account.provider = 'steam'
           AND account.disconnected_at IS NULL
         WHERE membership.wishlist_item_id = wishlist.id
           AND membership.user_id = wishlist.user_id AND membership.is_active
       ))
  )
  )`;
}

const DUE_SQL = `(${CATALOG_REFRESH_DUE_SQL} IS NULL OR ${CATALOG_REFRESH_DUE_SQL} <= NOW())`;
const ELIGIBLE_SQL = `
  catalog.metadata_retired_at IS NULL
  AND ${trackedCatalogSql()}
  AND ${DUE_SQL}
`;

export function catalogRefreshEnabled(value = process.env.METADATA_REFRESH_ENABLED) {
  return String(value ?? "false").toLowerCase() === "true";
}

export async function getCatalogRefreshStatus(userId, db = pool) {
  const { rows } = await db.query(`
    SELECT COUNT(*)::int AS tracked_count,
           COUNT(*) FILTER (WHERE ${DUE_SQL})::int AS due_count,
           COUNT(*) FILTER (WHERE catalog.metadata_failed_at IS NOT NULL)::int AS failed_count,
           MAX(catalog.metadata_fetched_at) AS last_metadata_update_at
      FROM catalog_games catalog
     WHERE catalog.metadata_retired_at IS NULL
       AND EXISTS (SELECT 1 FROM external_game_ids external
         WHERE external.catalog_game_id = catalog.id AND external.source = 'rawg')
       AND ${trackedCatalogSql("$1")}
  `, [userId]);
  const row = rows[0];
  return {
    enabled: catalogRefreshEnabled(),
    providerConfigured: Boolean(process.env.RAWG_API_KEY),
    intervalDays: 7,
    trackedCount: Number(row.tracked_count || 0),
    dueCount: Number(row.due_count || 0),
    failedCount: Number(row.failed_count || 0),
    lastMetadataUpdateAt: row.last_metadata_update_at || null,
  };
}

function refreshFailureAttempt(catalogGame) {
  const failedAt = catalogGame?.metadata_failed_at
    ? new Date(catalogGame.metadata_failed_at)
    : null;
  const retryAt = catalogGame?.metadata_next_refresh_at
    ? new Date(catalogGame.metadata_next_refresh_at)
    : null;
  if (!failedAt || !retryAt) return 1;
  const previousDelay = retryAt.getTime() - failedAt.getTime();
  const baseDelay = 6 * 60 * 60 * 1000;
  if (!Number.isFinite(previousDelay) || previousDelay <= 0) return 1;
  return Math.min(Math.floor(Math.log2(previousDelay / baseDelay)) + 2, 6);
}

export async function enqueueCatalogRefresh(options = {}, db = pool) {
  const providerBudget = positiveInt(
    options.providerBudget ?? process.env.METADATA_REFRESH_PROVIDER_BUDGET,
    DEFAULT_PROVIDER_BUDGET,
    250,
  );
  const maxItems = positiveInt(
    options.maxItems ?? process.env.METADATA_REFRESH_MAX_ITEMS,
    DEFAULT_MAX_ITEMS,
    250,
  );
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [73422, 1]);
    const active = await client.query(
      `SELECT * FROM metadata_jobs
        WHERE job_type = $1 AND scope_user_id IS NULL
          AND scope_catalog_game_id IS NULL
          AND status IN ('queued', 'running', 'paused')
        ORDER BY id DESC LIMIT 1`,
      [JOB_TYPE],
    );
    if (active.rows[0]) {
      await client.query("COMMIT");
      return serializeJob(active.rows[0]);
    }

    const eligible = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM catalog_games catalog
         JOIN external_game_ids external
           ON external.catalog_game_id = catalog.id AND external.source = 'rawg'
        WHERE ${ELIGIBLE_SQL}`,
    );
    const totalCount = Math.min(
      Number(eligible.rows[0].count),
      maxItems,
      providerBudget,
    );
    if (!totalCount) {
      await client.query("COMMIT");
      return null;
    }
    const created = await client.query(
      `INSERT INTO metadata_jobs (
         job_type, status, parameters_json, cursor_json, total_count,
         next_attempt_at
       ) VALUES ($1, 'queued', $2::jsonb, $3::jsonb, $4, NOW())
       RETURNING *`,
      [
        JOB_TYPE,
        JSON.stringify({ providerBudget, maxItems }),
        JSON.stringify({ lastCatalogGameId: 0, providerRequests: 0 }),
        totalCount,
      ],
    );
    await client.query("COMMIT");
    return serializeJob(created.rows[0]);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function claimJob(db, workerId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query(
      `SELECT * FROM metadata_jobs
        WHERE job_type = $1 AND status IN ('queued', 'running')
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
        ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1`,
      [JOB_TYPE],
    );
    if (!claimed.rows[0]) {
      await client.query("COMMIT");
      return null;
    }
    const updated = await client.query(
      `UPDATE metadata_jobs
          SET status = 'running', worker_id = $2,
              lease_expires_at = NOW() + ($3::int * INTERVAL '1 millisecond'),
              attempt_count = attempt_count + 1,
              started_at = COALESCE(started_at, NOW()), updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [claimed.rows[0].id, workerId, LEASE_MS],
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function nextCatalogGames(job, limit, db) {
  const cursor = jsonObject(job.cursor_json);
  const { rows } = await db.query(
    `SELECT catalog.*, external.external_id AS rawg_id
       FROM catalog_games catalog
       JOIN external_game_ids external
         ON external.catalog_game_id = catalog.id AND external.source = 'rawg'
      WHERE catalog.id > $1 AND ${ELIGIBLE_SQL}
      ORDER BY catalog.id LIMIT $2`,
    [Number(cursor.lastCatalogGameId || 0), limit],
  );
  return rows;
}

async function recordResult(job, catalogGame, outcome, db) {
  const cursor = jsonObject(job.cursor_json);
  const nextCursor = {
    ...cursor,
    lastCatalogGameId: Number(catalogGame.id),
    providerRequests: Number(cursor.providerRequests || 0) + 1,
  };
  await db.query(
    `UPDATE metadata_jobs
        SET cursor_json = $2::jsonb,
            processed_count = processed_count + 1,
            linked_count = linked_count + $3,
            failed_count = failed_count + $4,
            last_error_code = COALESCE($5, last_error_code),
            lease_expires_at = NOW() + ($6::int * INTERVAL '1 millisecond'),
            updated_at = NOW()
      WHERE id = $1`,
    [
      job.id,
      JSON.stringify(nextCursor),
      outcome.refreshed ? 1 : 0,
      outcome.failed ? 1 : 0,
      outcome.errorCode || null,
      LEASE_MS,
    ],
  );
  job.cursor_json = nextCursor;
  job.processed_count = Number(job.processed_count || 0) + 1;
  job.failed_count = Number(job.failed_count || 0) + (outcome.failed ? 1 : 0);
}

async function finishJob(jobId, db) {
  await db.query(
    `UPDATE metadata_jobs
        SET status = 'completed', completed_at = NOW(), worker_id = NULL,
            lease_expires_at = NULL, next_attempt_at = NULL, updated_at = NOW()
      WHERE id = $1`,
    [jobId],
  );
}

export async function processNextCatalogRefreshBatch({
  db = pool,
  batchSize = DEFAULT_BATCH_SIZE,
  workerId = `metadata-refresh-${process.pid}-${crypto.randomUUID()}`,
  ingestRawgGameMetadataFn = ingestRawgGameMetadata,
  now = () => new Date(),
} = {}) {
  const job = await claimJob(db, workerId);
  if (!job) return null;
  const parameters = jsonObject(job.parameters_json);
  const cursor = jsonObject(job.cursor_json);
  const remainingItems = Number(job.total_count || 0) - Number(job.processed_count || 0);
  const remainingBudget = Number(parameters.providerBudget || 0) - Number(cursor.providerRequests || 0);
  const limit = Math.min(
    positiveInt(batchSize, DEFAULT_BATCH_SIZE, 10),
    remainingItems,
    remainingBudget,
  );
  if (limit <= 0) {
    await finishJob(job.id, db);
    return { jobId: Number(job.id), completed: true, processed: 0 };
  }

  const games = await nextCatalogGames(job, limit, db);
  if (!games.length) {
    await finishJob(job.id, db);
    return { jobId: Number(job.id), completed: true, processed: 0 };
  }

  for (const game of games) {
    let outcome;
    try {
      const result = await ingestRawgGameMetadataFn(game.rawg_id, { force: true });
      const refreshed = result.catalogGame || game;
      await db.query(
        `UPDATE catalog_games
            SET metadata_next_refresh_at = $2,
                metadata_failed_at = NULL, metadata_failure_reason = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [game.id, nextCatalogRefreshAt(refreshed, now())],
      );
      outcome = { refreshed: true };
    } catch (error) {
      const errorCode = String(error?.code || "catalog_refresh_failed");
      const attemptedAt = now();
      const retryAt = nextCatalogRefreshRetryAt(refreshFailureAttempt(game), attemptedAt);
      const providerRetryMs = Number(error?.retryAfterMs);
      if (Number.isFinite(providerRetryMs) && providerRetryMs > 0) {
        retryAt.setTime(Math.max(retryAt.getTime(), attemptedAt.getTime() + providerRetryMs));
      }
      await db.query(
        `UPDATE catalog_games
            SET metadata_failed_at = $4, metadata_failure_reason = $2,
                metadata_next_refresh_at = $3, updated_at = NOW()
          WHERE id = $1`,
        [
          game.id,
          errorCode,
          retryAt,
          attemptedAt,
        ],
      );
      outcome = { failed: true, errorCode };
    }
    await recordResult(job, game, outcome, db);
  }

  const completed = Number(job.processed_count || 0) >= Number(job.total_count || 0);
  if (completed) {
    await finishJob(job.id, db);
  } else {
    await db.query(
      `UPDATE metadata_jobs
          SET status = 'queued', worker_id = NULL, lease_expires_at = NULL,
              next_attempt_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [job.id],
    );
  }
  return { jobId: Number(job.id), completed, processed: games.length };
}

export function startCatalogRefreshScheduler(options = {}) {
  const enabled = catalogRefreshEnabled(options.enabled);
  if (!enabled) return () => {};

  const intervalMs = positiveInt(
    options.intervalMs ?? process.env.METADATA_REFRESH_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    24 * 60 * 60 * 1000,
    60 * 1000,
  );
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await enqueueCatalogRefresh(options, options.db || pool);
      await processNextCatalogRefreshBatch(options);
    } catch (error) {
      console.error("Catalog metadata refresh failed:", error?.code || error?.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  void run();
  return () => clearInterval(timer);
}
