import { pool } from "../db.js";
import { badRequest } from "../utils/httpError.js";

export function serializeActivityEvent(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    source: row.source,
    eventType: row.event_type,
    gameId: row.game_id == null ? null : Number(row.game_id),
    catalogGameId:
      row.catalog_game_id == null ? null : Number(row.catalog_game_id),
    wishlistItemId:
      row.wishlist_item_id == null ? null : Number(row.wishlist_item_id),
    externalId: row.external_id || null,
    syncRunId: row.sync_run_id == null ? null : Number(row.sync_run_id),
    dedupeKey: row.dedupe_key,
    payload: row.payload_json || {},
    state: row.state,
    seenAt: row.seen_at,
    observedAt: row.observed_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export async function createOpenActivityEvent(
  {
    userId,
    source,
    eventType,
    gameId = null,
    catalogGameId = null,
    wishlistItemId = null,
    externalId = null,
    syncRunId = null,
    dedupeKey,
    payload = {},
    observedAt = null,
  },
  client = pool,
) {
  const withWishlist = wishlistItemId != null;
  const columns = withWishlist
    ? "user_id, source, event_type, game_id, catalog_game_id, wishlist_item_id, external_id, sync_run_id, dedupe_key, payload_json, observed_at"
    : "user_id, source, event_type, game_id, catalog_game_id, external_id, sync_run_id, dedupe_key, payload_json, observed_at";
  const values = withWishlist
    ? "$1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, COALESCE($11::timestamptz, NOW())"
    : "$1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, COALESCE($10::timestamptz, NOW())";
  const params = [userId, source, eventType, gameId, catalogGameId];
  if (withWishlist) params.push(wishlistItemId);
  params.push(externalId, syncRunId, dedupeKey, JSON.stringify(payload || {}), observedAt);
  const { rows } = await client.query(
    `INSERT INTO user_activity_events (${columns}) VALUES (${values})
     ON CONFLICT (user_id, source, dedupe_key) WHERE state = 'open'
     DO NOTHING RETURNING *`,
    params,
  );
  return rows[0] || null;
}

export async function listActivityEvents(
  userId,
  { source = null, state = "open", limit = 100 } = {},
) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const params = [userId];
  const where = ["user_id = $1"];
  if (source) {
    params.push(source);
    where.push(`source = $${params.length}`);
  }
  if (state) {
    params.push(state);
    where.push(`state = $${params.length}`);
  }
  params.push(safeLimit);
  const { rows } = await pool.query(
    `
    SELECT *
    FROM user_activity_events
    WHERE ${where.join(" AND ")}
    ORDER BY observed_at DESC, id DESC
    LIMIT $${params.length}
    `,
    params,
  );
  return { events: rows.map(serializeActivityEvent) };
}

export async function updateActivityEvent(userId, eventId, action) {
  const id = Number(eventId);
  if (!Number.isInteger(id)) throw badRequest("Invalid activity event id.");
  const assignments =
    action === "mark_seen"
      ? "seen_at = COALESCE(seen_at, NOW())"
      : action === "dismiss"
        ? "state = 'dismissed', seen_at = COALESCE(seen_at, NOW()), resolved_at = NOW()"
        : null;
  if (!assignments) throw badRequest("Unsupported activity action.");
  const { rows } = await pool.query(
    `
    UPDATE user_activity_events
       SET ${assignments}
     WHERE id = $1 AND user_id = $2
     RETURNING *
    `,
    [id, userId],
  );
  return serializeActivityEvent(rows[0]);
}
