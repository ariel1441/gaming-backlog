import crypto from "node:crypto";
import { pool } from "../db.js";
import { searchCatalog } from "./catalogService.js";
import { ingestRawgGameMetadata } from "./metadataIngestionService.js";
import { isSameGameTitle } from "../utils/gameTitle.js";
import { conflict, notFound } from "../utils/httpError.js";
import { cacheClear } from "../utils/microCache.js";

const JOB_TYPE = "backlog_repair";
const DEFAULT_BATCH_SIZE = 3;
const DEFAULT_PROVIDER_BUDGET = 40;
const DEFAULT_INTERVAL_MS = 5_000;
const LEASE_MS = 60_000;

function positiveInt(value, fallback, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
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
  return {
    id: Number(row.id),
    status: row.status,
    totalCount: row.total_count == null ? null : Number(row.total_count),
    processedCount: Number(row.processed_count || 0),
    linkedCount: Number(row.linked_count || 0),
    reviewCount: Number(row.review_count || 0),
    unmatchedCount: Number(row.unmatched_count || 0),
    failedCount: Number(row.failed_count || 0),
    lastErrorCode: row.last_error_code || null,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function enqueueMetadataRepair(userId, db = pool) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [
      Number(userId),
      73421,
    ]);
    const active = await client.query(
      `
      SELECT * FROM metadata_jobs
       WHERE job_type = $1
         AND scope_user_id = $2
         AND status IN ('queued', 'running', 'paused')
       ORDER BY id DESC LIMIT 1
      `,
      [JOB_TYPE, userId],
    );
    if (active.rows[0]) {
      await client.query("COMMIT");
      return serializeJob(active.rows[0]);
    }

    const total = await client.query(
      `
      SELECT COUNT(*)::int AS count
        FROM games game
        LEFT JOIN catalog_games catalog ON catalog.id = game.catalog_game_id
       WHERE game.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM game_metadata_candidates candidate
            WHERE candidate.game_id = game.id
              AND candidate.user_id = $1
              AND candidate.decision = 'pending'
         )
         AND (
           game.catalog_game_id IS NULL OR
           catalog.metadata_quality IS DISTINCT FROM 'full'
         )
      `,
      [userId],
    );
    const created = await client.query(
      `
      INSERT INTO metadata_jobs (
        job_type, scope_user_id, requested_by_user_id, status,
        parameters_json, cursor_json, total_count, next_attempt_at
      )
      VALUES ($1, $2, $2, 'queued', $3::jsonb, $4::jsonb, $5, NOW())
      RETURNING *
      `,
      [
        JOB_TYPE,
        userId,
        JSON.stringify({
          providerSearchBudget: positiveInt(
            process.env.METADATA_REPAIR_PROVIDER_BUDGET,
            DEFAULT_PROVIDER_BUDGET,
            250,
          ),
        }),
        JSON.stringify({ lastGameId: 0, providerSearches: 0 }),
        total.rows[0].count,
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

export async function getLatestMetadataRepair(userId, db = pool) {
  const { rows } = await db.query(
    `
    SELECT job.*,
           (SELECT COUNT(*)::int FROM game_metadata_candidates candidate
             WHERE candidate.user_id = $1 AND candidate.decision = 'pending')
             AS pending_candidate_count,
           (SELECT COUNT(DISTINCT candidate.game_id)::int
              FROM game_metadata_candidates candidate
             WHERE candidate.user_id = $1 AND candidate.decision = 'pending')
             AS pending_review_game_count
      FROM metadata_jobs job
     WHERE job.job_type = $2 AND job.scope_user_id = $1
     ORDER BY job.id DESC LIMIT 1
    `,
    [userId, JOB_TYPE],
  );
  return {
    job: serializeJob(rows[0]),
    pendingCandidateCount: Number(rows[0]?.pending_candidate_count || 0),
    pendingReviewGameCount: Number(rows[0]?.pending_review_game_count || 0),
  };
}

async function claimJob(dbPool, workerId) {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query(
      `
      SELECT * FROM metadata_jobs
       WHERE job_type = $1
         AND status IN ('queued', 'running')
         AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
         AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
       ORDER BY created_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
      `,
      [JOB_TYPE],
    );
    if (!claimed.rows[0]) {
      await client.query("COMMIT");
      return null;
    }
    const updated = await client.query(
      `
      UPDATE metadata_jobs
         SET status = 'running', worker_id = $2,
             lease_expires_at = NOW() + ($3::int * INTERVAL '1 millisecond'),
             attempt_count = attempt_count + 1,
             started_at = COALESCE(started_at, NOW()), updated_at = NOW()
       WHERE id = $1
       RETURNING *
      `,
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

async function nextGames(job, limit, db = pool) {
  const cursor = jsonObject(job.cursor_json);
  const { rows } = await db.query(
    `
    SELECT game.id, game.user_id, game.name, game.rawg_id, game.rawg_slug,
           game.catalog_game_id, catalog.metadata_quality,
           external.external_id AS catalog_rawg_id,
           external.slug AS catalog_rawg_slug
      FROM games game
      LEFT JOIN catalog_games catalog ON catalog.id = game.catalog_game_id
      LEFT JOIN external_game_ids external
        ON external.catalog_game_id = game.catalog_game_id
       AND external.source = 'rawg'
     WHERE game.user_id = $1
       AND game.id > $2
       AND NOT EXISTS (
         SELECT 1 FROM game_metadata_candidates candidate
          WHERE candidate.game_id = game.id
            AND candidate.user_id = $1
            AND candidate.decision = 'pending'
       )
       AND (
         game.catalog_game_id IS NULL OR
         catalog.metadata_quality IS DISTINCT FROM 'full'
       )
     ORDER BY game.id
     LIMIT $3
    `,
    [job.scope_user_id, Number(cursor.lastGameId || 0), limit],
  );
  return rows;
}

async function localCatalogCandidates(game, db = pool) {
  const { rows } = await db.query(
    `
    SELECT catalog.id, catalog.name, catalog.cover_url, catalog.released_at,
           catalog.rawg_rating, catalog.metacritic,
           external.external_id AS rawg_id, external.slug AS rawg_slug
      FROM catalog_games catalog
      JOIN external_game_ids external
        ON external.catalog_game_id = catalog.id AND external.source = 'rawg'
     WHERE normalize_game_title_sql(catalog.name) = normalize_game_title_sql($1)
       AND catalog.metadata_retired_at IS NULL
     ORDER BY
       (catalog.metadata_quality = 'full') DESC,
       catalog.metadata_fetched_at DESC NULLS LAST,
       catalog.id
     LIMIT 8
    `,
    [game.name],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cover: row.cover_url,
    released: row.released_at,
    rating: row.rawg_rating,
    metacritic: row.metacritic,
    rawg_id: Number(row.rawg_id),
    rawg_slug: row.rawg_slug,
    candidateSource: "database",
  }));
}

async function saveCandidates(db, game, candidates) {
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const rawgId = Number(candidate.rawg_id ?? candidate.rawgId);
    const catalogId = Number(candidate.id ?? candidate.catalog_game_id);
    if (!Number.isInteger(rawgId) || !Number.isInteger(catalogId)) continue;
    if (seen.has(rawgId)) continue;
    seen.add(rawgId);
    unique.push({ ...candidate, rawgId, catalogId });
    if (unique.length >= 8) break;
  }

  for (const [index, candidate] of unique.entries()) {
    const exactTitle = isSameGameTitle(game.name, candidate.name);
    await db.query(
      `
      INSERT INTO game_metadata_candidates (
        user_id, game_id, catalog_game_id, provider, provider_game_id,
        candidate_rank, confidence_score, confidence_level, match_reason,
        evidence_json
      )
      VALUES ($1, $2, $3, 'rawg', $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (game_id, provider, provider_game_id) DO UPDATE
        SET catalog_game_id = EXCLUDED.catalog_game_id,
            candidate_rank = EXCLUDED.candidate_rank,
            confidence_score = EXCLUDED.confidence_score,
            confidence_level = EXCLUDED.confidence_level,
            match_reason = EXCLUDED.match_reason,
            evidence_json = EXCLUDED.evidence_json,
            updated_at = NOW()
      `,
      [
        game.user_id,
        game.id,
        candidate.catalogId,
        String(candidate.rawgId),
        index + 1,
        exactTitle ? 0.95 : Math.max(0.5, 0.8 - index * 0.05),
        exactTitle ? "high" : "medium",
        exactTitle ? "normalized_title" : "provider_search",
        JSON.stringify({ source: candidate.candidateSource || "rawg_search" }),
      ],
    );
  }
  return unique.length;
}

export function singleExactTitleCandidate(game, candidates = []) {
  const valid = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const rawgId = Number(candidate?.rawg_id ?? candidate?.rawgId);
    const catalogId = Number(candidate?.id ?? candidate?.catalog_game_id);
    return Number.isInteger(rawgId) && Number.isInteger(catalogId);
  });
  if (valid.length !== 1 || !isSameGameTitle(game?.name, valid[0]?.name)) {
    return null;
  }
  return valid[0];
}

async function exactRepairOutcome(game, rawgId, rawgSlug, dependencies) {
  const ingested = await dependencies.ingestRawgGameMetadata(rawgId);
  const catalogId = Number(ingested.catalogGame.id);
  const duplicate = await dependencies.db.query(
    `SELECT 1 FROM games
      WHERE user_id = $1 AND catalog_game_id = $2 AND id <> $3 LIMIT 1`,
    [game.user_id, catalogId, game.id],
  );
  if (duplicate.rows[0]) return { unmatched: 1 };
  await dependencies.db.query(
    `
    UPDATE games
       SET catalog_game_id = $3,
           rawg_id = $4,
           rawg_slug = COALESCE($5, rawg_slug)
     WHERE id = $1 AND user_id = $2
    `,
    [
      game.id,
      game.user_id,
      catalogId,
      Number(rawgId),
      ingested.catalogGame.slug || rawgSlug || null,
    ],
  );
  return { linked: 1 };
}

async function processGame(job, game, dependencies) {
  const exactId = game.rawg_id || game.catalog_rawg_id;
  if (exactId) {
    return exactRepairOutcome(
      game,
      exactId,
      game.rawg_slug || game.catalog_rawg_slug,
      dependencies,
    );
  }

  let candidates = await localCatalogCandidates(game, dependencies.db);
  let providerSearches = 0;
  const cursor = jsonObject(job.cursor_json);
  const parameters = jsonObject(job.parameters_json);
  const budget = Number(parameters.providerSearchBudget || DEFAULT_PROVIDER_BUDGET);
  if (!candidates.length && Number(cursor.providerSearches || 0) < budget) {
    const payload = await dependencies.searchCatalog(game.name, {
      id: game.user_id,
      is_guest: false,
    });
    candidates = (payload.results || []).map((candidate) => ({
      ...candidate,
      candidateSource: payload.source || "rawg_search",
    }));
    providerSearches = 1;
  }
  const automaticCandidate = singleExactTitleCandidate(game, candidates);
  if (automaticCandidate) {
    const outcome = await exactRepairOutcome(
      game,
      Number(automaticCandidate.rawg_id ?? automaticCandidate.rawgId),
      automaticCandidate.rawg_slug ?? automaticCandidate.rawgSlug,
      dependencies,
    );
    return { ...outcome, providerSearches };
  }
  const saved = await saveCandidates(dependencies.db, game, candidates);
  return saved
    ? { review: 1, providerSearches }
    : { unmatched: 1, providerSearches };
}

async function recordOutcome(job, gameId, outcome, db = pool) {
  const cursor = jsonObject(job.cursor_json);
  await db.query(
    `
    UPDATE metadata_jobs
       SET cursor_json = $2::jsonb,
           processed_count = processed_count + 1,
           linked_count = linked_count + $3,
           review_count = review_count + $4,
           unmatched_count = unmatched_count + $5,
           failed_count = failed_count + $6,
           lease_expires_at = NOW() + ($7::int * INTERVAL '1 millisecond'),
           updated_at = NOW()
     WHERE id = $1
    `,
    [
      job.id,
      JSON.stringify({
        ...cursor,
        lastGameId: Number(gameId),
        providerSearches:
          Number(cursor.providerSearches || 0) +
          Number(outcome.providerSearches || 0),
      }),
      Number(outcome.linked || 0),
      Number(outcome.review || 0),
      Number(outcome.unmatched || 0),
      Number(outcome.failed || 0),
      LEASE_MS,
    ],
  );
  job.cursor_json = {
    ...cursor,
    lastGameId: Number(gameId),
    providerSearches:
      Number(cursor.providerSearches || 0) + Number(outcome.providerSearches || 0),
  };
}

export async function processNextMetadataRepairBatch({
  db = pool,
  batchSize = DEFAULT_BATCH_SIZE,
  workerId = `metadata-${process.pid}-${crypto.randomUUID()}`,
  searchCatalogFn = searchCatalog,
  ingestRawgGameMetadataFn = ingestRawgGameMetadata,
} = {}) {
  const job = await claimJob(db, workerId);
  if (!job) return null;
  const games = await nextGames(job, positiveInt(batchSize, DEFAULT_BATCH_SIZE, 10), db);
  if (!games.length) {
    await db.query(
      `UPDATE metadata_jobs
          SET status = 'completed', completed_at = NOW(), worker_id = NULL,
              lease_expires_at = NULL, next_attempt_at = NULL,
              processed_count = COALESCE(total_count, processed_count),
              updated_at = NOW()
        WHERE id = $1`,
      [job.id],
    );
    return { jobId: Number(job.id), completed: true };
  }

  for (const game of games) {
    let outcome;
    try {
      outcome = await processGame(job, game, {
        db,
        searchCatalog: searchCatalogFn,
        ingestRawgGameMetadata: ingestRawgGameMetadataFn,
      });
    } catch (error) {
      outcome = { failed: 1 };
      await db.query(
        `UPDATE metadata_jobs SET last_error_code = $2, updated_at = NOW()
          WHERE id = $1`,
        [job.id, String(error?.code || "metadata_item_failed")],
      );
    }
    await recordOutcome(job, game.id, outcome, db);
    if (outcome.linked) cacheClear(game.user_id);
  }
  await db.query(
    `UPDATE metadata_jobs
        SET status = 'queued', worker_id = NULL, lease_expires_at = NULL,
            next_attempt_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [job.id],
  );
  return { jobId: Number(job.id), completed: false, processed: games.length };
}

export function startMetadataRepairScheduler(options = {}) {
  const intervalMs = positiveInt(
    options.intervalMs ?? process.env.METADATA_REPAIR_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    60_000,
  );
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processNextMetadataRepairBatch(options);
    } catch (error) {
      console.error("Metadata repair worker failed:", error?.code || error?.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  void run();
  return () => clearInterval(timer);
}

export async function listMetadataCandidates(
  userId,
  { decision = "pending", limit = 50 } = {},
  db = pool,
) {
  const { rows } = await db.query(
    `
    SELECT candidate.id, candidate.game_id, candidate.catalog_game_id,
           candidate.provider_game_id, candidate.candidate_rank,
           candidate.confidence_score, candidate.confidence_level,
           candidate.match_reason, candidate.decision,
           game.name AS game_name,
           catalog.name AS candidate_name, catalog.cover_url,
           catalog.released_at, catalog.rawg_rating, catalog.metacritic,
           external.slug AS rawg_slug
      FROM game_metadata_candidates candidate
      JOIN games game ON game.id = candidate.game_id AND game.user_id = $1
      JOIN catalog_games catalog ON catalog.id = candidate.catalog_game_id
      LEFT JOIN external_game_ids external
        ON external.catalog_game_id = catalog.id AND external.source = 'rawg'
     WHERE candidate.user_id = $1 AND candidate.decision = $2
     ORDER BY game.id, candidate.candidate_rank, candidate.id
     LIMIT $3
    `,
    [userId, decision, positiveInt(limit, 50, 100)],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    gameId: Number(row.game_id),
    gameName: row.game_name,
    catalogGameId: Number(row.catalog_game_id),
    rawgId: Number(row.provider_game_id),
    rawgSlug: row.rawg_slug || null,
    candidateName: row.candidate_name,
    cover: row.cover_url || null,
    released: row.released_at || null,
    rating: row.rawg_rating == null ? null : Number(row.rawg_rating),
    metacritic: row.metacritic == null ? null : Number(row.metacritic),
    rank: Number(row.candidate_rank),
    confidence: Number(row.confidence_score || 0),
    confidenceLevel: row.confidence_level,
    matchReason: row.match_reason,
    decision: row.decision,
  }));
}

async function ownedCandidate(userId, candidateId, db = pool) {
  const { rows } = await db.query(
    `
    SELECT candidate.*, external.external_id AS rawg_id, external.slug AS rawg_slug
      FROM game_metadata_candidates candidate
      JOIN games game ON game.id = candidate.game_id
      LEFT JOIN external_game_ids external
        ON external.catalog_game_id = candidate.catalog_game_id
       AND external.source = 'rawg'
     WHERE candidate.id = $1
       AND candidate.user_id = $2
       AND game.user_id = $2
     LIMIT 1
    `,
    [candidateId, userId],
  );
  return rows[0] || null;
}

export async function decideMetadataCandidate(
  userId,
  candidateId,
  action,
  dependencies = {},
) {
  const db = dependencies.db || pool;
  const candidate = await ownedCandidate(userId, candidateId, db);
  if (!candidate) throw notFound("Metadata candidate not found.");
  if (action !== "accept") {
    const decision = action === "skip" ? "skipped" : "rejected";
    if (action === "skip") {
      await db.query(
        `UPDATE game_metadata_candidates
            SET decision = 'skipped', decided_at = NOW(), updated_at = NOW()
          WHERE game_id = $1 AND user_id = $2 AND decision = 'pending'`,
        [candidate.game_id, userId],
      );
    } else {
      await db.query(
        `UPDATE game_metadata_candidates
            SET decision = $3, decided_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND user_id = $2`,
        [candidateId, userId, decision],
      );
    }
    return { candidateId: Number(candidateId), decision };
  }
  return acceptRawgMetadataSelection(
    userId,
    candidate.game_id,
    candidate.rawg_id,
    { ...dependencies, candidateId },
  );
}

export async function acceptRawgMetadataSelection(
  userId,
  gameId,
  rawgId,
  dependencies = {},
) {
  const db = dependencies.db || pool;
  const ingest =
    dependencies.ingestRawgGameMetadata || ingestRawgGameMetadata;
  const game = await db.query(
    "SELECT id FROM games WHERE id = $1 AND user_id = $2",
    [gameId, userId],
  );
  if (!game.rows[0]) throw notFound("Game not found.");
  const ingested = await ingest(rawgId);
  const catalogId = Number(ingested.catalogGame.id);
  const duplicate = await db.query(
    `SELECT 1 FROM games
      WHERE user_id = $1 AND catalog_game_id = $2 AND id <> $3 LIMIT 1`,
    [userId, catalogId, gameId],
  );
  if (duplicate.rows[0]) {
    throw conflict("That catalog game is already linked in your backlog.");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE games
          SET catalog_game_id = $3, rawg_id = $4,
              rawg_slug = COALESCE($5, rawg_slug)
        WHERE id = $1 AND user_id = $2`,
      [
        gameId,
        userId,
        catalogId,
        Number(rawgId),
        ingested.catalogGame.slug || null,
      ],
    );
    await client.query(
      `UPDATE game_metadata_candidates
          SET decision = CASE WHEN id = $3 THEN 'accepted' ELSE 'rejected' END,
              decided_at = NOW(), updated_at = NOW()
        WHERE game_id = $1 AND user_id = $2 AND decision = 'pending'`,
      [gameId, userId, dependencies.candidateId || -1],
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
  return {
    gameId: Number(gameId),
    catalogGameId: catalogId,
    rawgId: Number(rawgId),
    decision: "accepted",
  };
}
