import crypto from "node:crypto";
import { pool } from "../db.js";
import { fetchGameDataByIdOrSlug } from "../utils/fetchRAWG.js";
import { sanitizeGameHtml } from "../utils/sanitizeHtml.js";
import { toHourInt } from "../utils/time.js";

export const RAWG_NORMALIZATION_VERSION = 1;
const PROVIDER = "rawg";
const DEFAULT_PROVIDER_CONCURRENCY = 4;

export class MetadataIngestionError extends Error {
  constructor(code, message, { status = 502, retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "MetadataIngestionError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function positiveRawgId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new MetadataIngestionError("invalid_rawg_id", "RAWG id is invalid.", {
      status: 400,
    });
  }
  return parsed;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createTaskLimiter(limit) {
  const maxActive = Math.min(
    positiveInteger(limit, DEFAULT_PROVIDER_CONCURRENCY),
    20,
  );
  let active = 0;
  const queue = [];

  const startNext = () => {
    while (active < maxActive && queue.length) {
      const { task, resolve, reject } = queue.shift();
      active += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          startNext();
        });
    }
  };

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      startNext();
    });
}

function cleanString(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function dateOnly(value) {
  const text = cleanString(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function positiveNumber(value, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max ? parsed : null;
}

function uniqueNames(values, limit = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const names = [];
  for (const value of values) {
    const name = cleanString(value?.name ?? value);
    if (!name) continue;
    const key = name.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}

function normalizeStores(values) {
  if (!Array.isArray(values)) return [];
  const stores = [];
  const seen = new Set();
  for (const value of values) {
    const store = value?.store ?? value;
    const name = cleanString(store?.name ?? value?.store_name ?? value?.name);
    if (!name) continue;
    const id = store?.id ?? value?.store_id ?? value?.id ?? null;
    const key = id == null ? name.toLocaleLowerCase("en") : String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    stores.push({
      id,
      name,
      url: cleanString(value?.url) || "",
    });
  }
  return stores;
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalizeJson(value[key])]),
    );
  }
  return value;
}

export function canonicalProviderPayload(payload) {
  return JSON.stringify(canonicalizeJson(payload));
}

export function providerPayloadHash(payload) {
  return crypto
    .createHash("sha256")
    .update(canonicalProviderPayload(payload), "utf8")
    .digest("hex");
}

export function normalizeRawgDetailSnapshot(payload, expectedRawgId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MetadataIngestionError(
      "rawg_invalid_detail",
      "RAWG returned an invalid game detail response.",
    );
  }

  const rawgId = positiveRawgId(payload.id ?? payload.rawg_id);
  if (expectedRawgId != null && rawgId !== positiveRawgId(expectedRawgId)) {
    throw new MetadataIngestionError(
      "rawg_identity_mismatch",
      "RAWG returned a different game identity.",
    );
  }

  const name = cleanString(payload.name);
  if (!name) {
    throw new MetadataIngestionError(
      "rawg_invalid_detail",
      "RAWG returned game detail without a title.",
    );
  }

  const description = sanitizeGameHtml(payload.description);
  const coverUrl = cleanString(payload.background_image ?? payload.cover);
  return {
    rawgId,
    rawgSlug: cleanString(payload.slug ?? payload.rawg_slug),
    name,
    coverUrl,
    coverExternalId: coverUrl,
    releasedAt: dateOnly(payload.released),
    descriptionHtml: description || null,
    rawgRating: positiveNumber(payload.rating, 5),
    metacritic: positiveNumber(payload.metacritic, 100),
    rawgPlaytimeHours: toHourInt(
      payload.playtime ??
        payload.time_to_beat?.main ??
        payload.time_to_beat?.main_story,
    ),
    genres: uniqueNames(payload.genres),
    stores: normalizeStores(payload.stores),
    tags: uniqueNames(payload.tags, 40),
    payloadJson: canonicalProviderPayload(payload),
    payloadHash: providerPayloadHash(payload),
    normalizationVersion: RAWG_NORMALIZATION_VERSION,
  };
}

async function selectExisting(db, rawgId) {
  const { rows } = await db.query(
    `
    SELECT cg.*,
           EXISTS (
             SELECT 1
               FROM catalog_provider_snapshots snapshot
              WHERE snapshot.catalog_game_id = cg.id
                AND snapshot.provider = 'rawg'
                AND snapshot.provider_game_id = $1
           ) AS has_provider_snapshot
      FROM catalog_games cg
      JOIN external_game_ids external
        ON external.catalog_game_id = cg.id
       AND external.source = 'rawg'
     WHERE external.external_id = $1
     LIMIT 1
    `,
    [String(rawgId)],
  );
  return rows[0] || null;
}

function reusable(row) {
  return (
    row?.metadata_quality === "full" &&
    row?.has_provider_snapshot === true &&
    Number(row?.metadata_normalization_version) >= RAWG_NORMALIZATION_VERSION
  );
}

async function markFailure(dbPool, catalogGameId, error) {
  if (!catalogGameId) return;
  const code = cleanString(error?.code) || "rawg_detail_failed";
  await dbPool.query(
    `
    UPDATE catalog_games
       SET metadata_failed_at = NOW(),
           metadata_failure_reason = $2,
           updated_at = NOW()
     WHERE id = $1
    `,
    [catalogGameId, code],
  );
}

async function persistNormalizedDetail(
  dbPool,
  detail,
  {
    force = false,
    preserveExistingFull = false,
    archiveSnapshot = false,
    providerFetched = true,
  } = {},
) {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [PROVIDER, String(detail.rawgId)],
    );

    let existing = await selectExisting(client, detail.rawgId);
    if (reusable(existing) && !force && !archiveSnapshot) {
      await client.query("COMMIT");
      return {
        catalogGame: existing,
        providerFetched,
        reused: true,
        snapshotStored: false,
      };
    }

    let catalogGame;
    if (existing?.metadata_quality === "full" && preserveExistingFull) {
      catalogGame = existing;
    } else if (existing) {
      const { rows } = await client.query(
        `
        UPDATE catalog_games
           SET name = $2,
               canonical_title = $2,
               slug = COALESCE($3, slug),
               cover_url = CASE
                 WHEN NOT cover_pinned
                  AND (cover_url IS NULL OR btrim(cover_url) = '')
                 THEN COALESCE($4, cover_url)
                 ELSE cover_url
               END,
               cover_source = CASE
                 WHEN NOT cover_pinned
                  AND (cover_url IS NULL OR btrim(cover_url) = '')
                  AND $4 IS NOT NULL
                 THEN 'rawg'
                 ELSE cover_source
               END,
               cover_external_id = CASE
                 WHEN NOT cover_pinned
                  AND (cover_url IS NULL OR btrim(cover_url) = '')
                  AND $4 IS NOT NULL
                 THEN $5
                 ELSE cover_external_id
               END,
               released_at = COALESCE($6, released_at),
               description_html = COALESCE($7, description_html),
               rawg_rating = COALESCE($8, rawg_rating),
               metacritic = COALESCE($9, metacritic),
               rawg_playtime_hours = COALESCE($10, rawg_playtime_hours),
               genres_json = CASE
                 WHEN jsonb_array_length($11::jsonb) > 0 THEN $11::jsonb
                 ELSE genres_json
               END,
               stores_json = CASE
                 WHEN jsonb_array_length($12::jsonb) > 0 THEN $12::jsonb
                 ELSE stores_json
               END,
               tags_json = CASE
                 WHEN jsonb_array_length($13::jsonb) > 0 THEN $13::jsonb
                 ELSE tags_json
               END,
               metadata_quality = 'full',
               metadata_source = 'rawg',
               metadata_fetched_at = $14,
               metadata_failed_at = NULL,
               metadata_failure_reason = NULL,
               metadata_normalization_version = $15,
               metadata_retired_at = NULL,
               updated_at = NOW()
         WHERE id = $1
         RETURNING *
        `,
        [
          existing.id,
          detail.name,
          detail.rawgSlug,
          detail.coverUrl,
          detail.coverExternalId,
          detail.releasedAt,
          detail.descriptionHtml,
          detail.rawgRating,
          detail.metacritic,
          detail.rawgPlaytimeHours,
          JSON.stringify(detail.genres),
          JSON.stringify(detail.stores),
          JSON.stringify(detail.tags),
          detail.fetchedAt,
          detail.normalizationVersion,
        ],
      );
      catalogGame = rows[0];
      await client.query(
        `
        UPDATE external_game_ids
           SET slug = COALESCE($3, slug), updated_at = NOW()
         WHERE source = $1 AND external_id = $2
        `,
        [PROVIDER, String(detail.rawgId), detail.rawgSlug],
      );
    } else {
      const { rows } = await client.query(
        `
        INSERT INTO catalog_games (
          name, canonical_title, slug, cover_url, cover_source,
          cover_external_id, released_at, description_html, rawg_rating,
          metacritic, rawg_playtime_hours, genres_json, stores_json, tags_json,
          metadata_quality, metadata_source, metadata_fetched_at,
          metadata_normalization_version
        )
        VALUES (
          $1, $1, $2, $3, CASE WHEN $3::text IS NULL THEN NULL ELSE 'rawg' END,
          $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
          'full', 'rawg', $13, $14
        )
        RETURNING *
        `,
        [
          detail.name,
          detail.rawgSlug,
          detail.coverUrl,
          detail.coverExternalId,
          detail.releasedAt,
          detail.descriptionHtml,
          detail.rawgRating,
          detail.metacritic,
          detail.rawgPlaytimeHours,
          JSON.stringify(detail.genres),
          JSON.stringify(detail.stores),
          JSON.stringify(detail.tags),
          detail.fetchedAt,
          detail.normalizationVersion,
        ],
      );
      catalogGame = rows[0];
      await client.query(
        `
        INSERT INTO external_game_ids
          (catalog_game_id, source, external_id, slug)
        VALUES ($1, 'rawg', $2, $3)
        `,
        [catalogGame.id, String(detail.rawgId), detail.rawgSlug],
      );
    }

    const snapshot = await client.query(
      `
      INSERT INTO catalog_provider_snapshots (
        catalog_game_id, provider, provider_game_id, payload_json,
        payload_hash, normalization_version, fetched_at
      )
      VALUES ($1, 'rawg', $2, $3::jsonb, $4, $5, $6)
      ON CONFLICT (catalog_game_id, provider, payload_hash) DO NOTHING
      RETURNING id
      `,
      [
        catalogGame.id,
        String(detail.rawgId),
        detail.payloadJson,
        detail.payloadHash,
        detail.normalizationVersion,
        detail.fetchedAt,
      ],
    );

    await client.query("COMMIT");
    return {
      catalogGame,
      providerFetched,
      reused: Boolean(existing),
      snapshotStored: snapshot.rows.length > 0,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export function createMetadataIngestionService({
  dbPool = pool,
  fetchRawgDetail = fetchGameDataByIdOrSlug,
  now = () => new Date(),
  providerConcurrency = Number(process.env.RAWG_INGEST_CONCURRENCY) ||
    DEFAULT_PROVIDER_CONCURRENCY,
} = {}) {
  const inflight = new Map();
  const runProviderTask = createTaskLimiter(providerConcurrency);

  async function ingest(rawgId, options = {}) {
    const id = positiveRawgId(rawgId);
    const force = options.force === true;
    const existing = await selectExisting(dbPool, id);
    if (reusable(existing) && !force) {
      return {
        catalogGame: existing,
        providerFetched: false,
        reused: true,
        snapshotStored: false,
      };
    }

    let detail;
    try {
      const payload = await runProviderTask(() => fetchRawgDetail(id));
      if (!payload) {
        throw new MetadataIngestionError(
          "rawg_game_not_found",
          "RAWG game was not found.",
          { status: 404 },
        );
      }
      detail = normalizeRawgDetailSnapshot(payload, id);
      detail.fetchedAt = now();
    } catch (error) {
      try {
        await markFailure(dbPool, existing?.id, error);
      } catch {}
      throw error;
    }
    return persistNormalizedDetail(dbPool, detail, { force });
  }

  async function ingestRawgGame(rawgId, options = {}) {
    const id = positiveRawgId(rawgId);
    const key = `${id}:${options.force === true ? "force" : "normal"}`;
    if (!inflight.has(key)) {
      inflight.set(
        key,
        ingest(id, options).finally(() => inflight.delete(key)),
      );
    }
    return inflight.get(key);
  }

  async function ingestRawgSnapshot(payload, options = {}) {
    const expectedId = options.expectedRawgId ?? payload?.id ?? payload?.rawg_id;
    const detail = normalizeRawgDetailSnapshot(payload, expectedId);
    const suppliedDate = options.fetchedAt
      ? new Date(options.fetchedAt)
      : now();
    if (Number.isNaN(suppliedDate.getTime())) {
      throw new MetadataIngestionError(
        "invalid_snapshot_date",
        "Provider snapshot date is invalid.",
        { status: 400 },
      );
    }
    detail.fetchedAt = suppliedDate;
    return persistNormalizedDetail(dbPool, detail, {
      preserveExistingFull: options.preserveExistingFull !== false,
      archiveSnapshot: true,
      providerFetched: false,
    });
  }

  return { ingestRawgGame, ingestRawgSnapshot };
}

const defaultService = createMetadataIngestionService();

export const ingestRawgGameMetadata = (...args) =>
  defaultService.ingestRawgGame(...args);

export const ingestRawgMetadataSnapshot = (...args) =>
  defaultService.ingestRawgSnapshot(...args);
