import { pool } from "../db.js";
import { assertSavedAccountUser } from "./steamWishlistService.js";
import { badRequest } from "../utils/httpError.js";
import { serializeActivityEvent } from "./activityEventService.js";

// Current-connection evidence only. Old connection history stays in its source tables.
const scope = `FROM user_activity_events e
  JOIN steam_sync_jobs job ON job.sync_run_id = e.sync_run_id AND job.user_id = e.user_id
  JOIN user_external_accounts account ON account.id = job.account_id AND account.user_id = e.user_id
    AND account.provider = 'steam' AND account.disconnected_at IS NULL AND account.provider_user_id = job.provider_user_id
  LEFT JOIN user_activity_inbox inbox ON inbox.user_id = e.user_id
  LEFT JOIN user_activity_receipts receipt ON receipt.user_id = e.user_id AND receipt.event_id = e.id
  LEFT JOIN games game ON game.id = e.game_id AND game.user_id = e.user_id
  LEFT JOIN user_wishlist_items wishlist ON wishlist.id = e.wishlist_item_id AND wishlist.user_id = e.user_id
  LEFT JOIN catalog_games catalog ON catalog.id = COALESCE(e.catalog_game_id, wishlist.catalog_game_id)
  LEFT JOIN user_game_sources owned ON owned.user_id = e.user_id AND owned.provider = 'steam'
    AND owned.provider_app_id = e.external_id AND owned.source_status IN ('owned', 'ignored') AND owned.last_synced_at >= account.linked_at
  LEFT JOIN LATERAL (
    SELECT w.id, w.local_intent_active, COALESCE(s.is_active, FALSE) AS steam_active,
      s.removed_at
    FROM user_wishlist_items w
    LEFT JOIN steam_wishlist_items s ON s.wishlist_item_id = w.id AND s.user_id = w.user_id AND s.account_id = account.id
     WHERE w.user_id = e.user_id AND (w.id = e.wishlist_item_id OR (
       e.wishlist_item_id IS NULL AND (s.steam_app_id = e.external_id OR EXISTS (
         SELECT 1 FROM steam_price_targets t WHERE t.user_id = e.user_id AND t.account_id = account.id
           AND t.wishlist_item_id = w.id AND t.steam_app_id = e.external_id
       ))
     ))
    ORDER BY w.local_intent_active DESC, w.id LIMIT 1
  ) related_wishlist ON TRUE
  WHERE e.user_id = $1 AND e.state <> 'dismissed' AND e.source IN ('steam_library', 'steam_wishlist', 'steam_prices')`;
const attention = `(e.source = 'steam_library' AND e.event_kind = 'decision' AND e.state = 'open')`;
const reviewedSteamActivity = `(e.source = 'steam_library'
  AND e.event_kind = 'decision' AND e.state = 'resolved')`;
const mutedPriceTransition = `(e.source = 'steam_prices'
  AND e.event_type IN ('steam_price_increase', 'steam_sale_ended'))`;
const attentionScope = `FROM user_activity_events e
  JOIN steam_sync_jobs job ON job.sync_run_id = e.sync_run_id AND job.user_id = e.user_id
  JOIN user_external_accounts account ON account.id = job.account_id AND account.user_id = e.user_id
    AND account.provider = 'steam' AND account.disconnected_at IS NULL AND account.provider_user_id = job.provider_user_id
  WHERE e.user_id = $1 AND e.state <> 'dismissed' AND e.source IN ('steam_library', 'steam_wishlist', 'steam_prices')`;
const updateCountScope = `FROM user_activity_events e
  JOIN steam_sync_jobs job ON job.sync_run_id = e.sync_run_id AND job.user_id = e.user_id
  JOIN user_external_accounts account ON account.id = job.account_id AND account.user_id = e.user_id
    AND account.provider = 'steam' AND account.disconnected_at IS NULL AND account.provider_user_id = job.provider_user_id
  LEFT JOIN user_activity_receipts receipt ON receipt.user_id = e.user_id AND receipt.event_id = e.id
  WHERE e.user_id = $1 AND e.state <> 'dismissed' AND e.source IN ('steam_library', 'steam_wishlist', 'steam_prices')`;
// Ownership and Wishlist removal can arrive in either order, in separate runs.
// Keep the acquisition decision as the single delivery, even after it is dismissed.
// Facts remain intact. Old connections must never suppress current notifications.
const pairedRemoval = `(owned.id IS NOT NULL AND e.source = 'steam_wishlist'
  AND e.event_type IN ('wishlist_removed', 'wishlist_likely_purchased') AND EXISTS (
    SELECT 1 FROM user_activity_events acquisition
    JOIN steam_sync_jobs acquisition_job ON acquisition_job.sync_run_id = acquisition.sync_run_id AND acquisition_job.user_id = acquisition.user_id
    WHERE acquisition.user_id = e.user_id AND acquisition.external_id = e.external_id
      AND acquisition.source = 'steam_library' AND acquisition.event_kind = 'decision'
      AND acquisition.event_type IN ('steam_new_game', 'steam_started_playing', 'steam_status_suggestion')
      AND acquisition_job.account_id = account.id AND acquisition_job.provider_user_id = account.provider_user_id
  ))`;
const visibleUpdate = `NOT ${attention} AND NOT ${reviewedSteamActivity}
  AND NOT ${mutedPriceTransition} AND receipt.dismissed_at IS NULL
  AND NOT (e.source = 'steam_prices' AND owned.id IS NOT NULL) AND NOT ${pairedRemoval}`;
const currentOwned = `EXISTS (
  SELECT 1 FROM user_game_sources owned
  WHERE owned.user_id = e.user_id AND owned.provider = 'steam'
    AND owned.provider_app_id = e.external_id AND owned.source_status IN ('owned', 'ignored')
    AND owned.last_synced_at >= account.linked_at
)`;
const pairedRemovalFast = `EXISTS (
  SELECT 1 FROM user_activity_events acquisition
  JOIN steam_sync_jobs acquisition_job ON acquisition_job.sync_run_id = acquisition.sync_run_id
    AND acquisition_job.user_id = acquisition.user_id
  WHERE acquisition.user_id = e.user_id AND acquisition.external_id = e.external_id
    AND acquisition.source = 'steam_library' AND acquisition.event_kind = 'decision'
    AND acquisition.event_type IN ('steam_new_game', 'steam_started_playing', 'steam_status_suggestion')
    AND acquisition_job.account_id = account.id
    AND acquisition_job.provider_user_id = account.provider_user_id
)`;
const visibleUpdateFast = `NOT ${attention} AND NOT ${reviewedSteamActivity}
  AND NOT ${mutedPriceTransition} AND receipt.dismissed_at IS NULL
  AND NOT (e.source = 'steam_prices' AND ${currentOwned})
  AND NOT (e.source = 'steam_wishlist'
    AND e.event_type IN ('wishlist_removed', 'wishlist_likely_purchased')
    AND ${currentOwned} AND ${pairedRemovalFast})`;
// Price transitions retain their exact group key. Other domains use game + run.
const groupKey = `CASE WHEN e.event_type = 'wishlist_priority_changed'
  THEN 'wishlist-order:' || account.id::text || ':' || e.sync_run_id::text
  WHEN e.payload_json->>'groupKey' IS NOT NULL
  THEN e.payload_json->>'groupKey'
  WHEN ${attention} AND e.game_id IS NULL
  AND e.event_type IN ('steam_new_game', 'steam_started_playing')
  THEN 'steam-acquisition:' || account.id::text || ':' || e.external_id
  ELSE e.source || ':' || COALESCE(e.payload_json->>'groupKey', e.sync_run_id::text || ':' || COALESCE(e.external_id, e.event_type)) END`;

export async function activateActivityInbox(userId) {
  await assertSavedAccountUser(userId);
  await pool.query(
    `INSERT INTO user_activity_inbox(user_id, baseline_event_id)
    SELECT $1, COALESCE(MAX(id), 0) FROM user_activity_events WHERE user_id = $1
    ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  return { activated: true };
}

export async function listActivityInbox(
  userId,
  { section = "updates", before = null, snapshot = null, limit = 20 } = {},
) {
  await assertSavedAccountUser(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const upper =
      snapshot ??
      (
        await client.query(
          "SELECT COALESCE(MAX(id), 0) AS id FROM user_activity_events WHERE user_id = $1",
          [userId],
        )
      ).rows[0].id;
    const counts = (
      await client.query(
        section === "attention"
          ? `SELECT COUNT(*) FILTER (WHERE ${attention})::int AS attention,
        COUNT(DISTINCT (${groupKey})) FILTER (WHERE ${attention})::int AS "pendingDecisions",
        NULL::int AS updates
        ${attentionScope}`
          : `SELECT NULL::int AS attention,
        NULL::int AS "pendingDecisions",
        COUNT(*) FILTER (WHERE ${visibleUpdateFast})::int AS updates
        ${updateCountScope}`,
        [userId],
      )
    ).rows[0];
    if (section !== "attention") {
      const attentionCounts = (
        await client.query(
          `SELECT COUNT(*) FILTER (WHERE ${attention})::int AS attention,
          COUNT(DISTINCT (${groupKey})) FILTER (WHERE ${attention})::int AS "pendingDecisions"
          ${attentionScope}`,
          [userId],
        )
      ).rows[0];
      counts.attention = attentionCounts.attention;
      counts.pendingDecisions = attentionCounts.pendingDecisions;
    }
    const filter = section === "attention" ? attention : visibleUpdate;
    const { rows: grouped } = await client.query(
      `WITH candidates AS (
      SELECT e.*, ${groupKey} AS inbox_group,
        CASE WHEN e.event_type = 'wishlist_priority_changed' THEN 'Steam Wishlist order updated'
          ELSE COALESCE(game.name, catalog.name, wishlist.display_name, e.payload_json->>'steamName', e.payload_json->>'name', 'Steam game') END AS title,
        COALESCE(game.cover, wishlist.cover_url, catalog.cover_url) AS cover,
        owned.id IS NOT NULL AS now_owned, receipt.read_at AS inbox_read_at,
        related_wishlist.id AS related_wishlist_id, related_wishlist.local_intent_active,
        related_wishlist.steam_active, related_wishlist.removed_at AS wishlist_removed_at,
        (inbox.user_id IS NOT NULL AND e.id > inbox.baseline_event_id AND receipt.read_at IS NULL) AS unseen
      ${scope} AND e.id <= $2 AND (${filter})
    ), groups AS (
      SELECT inbox_group, MAX(id) AS id, MAX(observed_at) AS observed_at, BOOL_OR(unseen) AS unseen,
        jsonb_agg(to_jsonb(candidates) ORDER BY id) AS events
      FROM candidates GROUP BY inbox_group
    ) SELECT * FROM groups WHERE ($3::bigint IS NULL OR id < $3) ORDER BY id DESC LIMIT $4`,
      [userId, upper, before, limit + 1],
    );
    await client.query("COMMIT");
    const page = grouped.slice(0, limit);
    return {
      snapshot: String(upper),
      nextCursor: grouped.length > limit ? String(page.at(-1).id) : null,
      counts,
      groups: page.map((group) => ({
        id: String(group.id),
        groupKey: group.inbox_group,
        observedAt: group.observed_at,
        unseen: group.unseen,
        events: group.events.map((row) => ({
          ...serializeActivityEvent(row),
          title: row.title,
          cover: row.cover,
          nowOwned: row.now_owned,
          inboxReadAt: row.inbox_read_at,
          wishlistContext:
            row.related_wishlist_id == null
              ? null
              : {
                  id: Number(row.related_wishlist_id),
                  localActive: Boolean(row.local_intent_active),
                  steamActive: Boolean(row.steam_active),
                  removedFromSteam: Boolean(
                    row.wishlist_removed_at && !row.steam_active,
                  ),
                },
        })),
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function hideOtherActivityUpdates(userId, snapshot) {
  await assertSavedAccountUser(userId);
  if (!/^\d{1,18}$/.test(String(snapshot)))
    throw badRequest("Invalid notification snapshot.");
  // Select complete informational groups, including groups beyond the loaded page.
  // An acquisition decision and a positive price transition are never swept up.
  const result = await pool.query(
    `WITH candidates AS (
    SELECT e.id, ${groupKey} AS inbox_group, e.event_type
    ${scope} AND e.id <= $2 AND (${visibleUpdate})
  ), eligible_groups AS (
    SELECT inbox_group FROM candidates GROUP BY inbox_group
    HAVING NOT BOOL_OR(event_type IN ('steam_price_drop', 'steam_sale_started'))
  ) INSERT INTO user_activity_receipts(user_id, event_id, dismissed_at)
    SELECT $1, c.id, NOW() FROM candidates c JOIN eligible_groups g USING (inbox_group)
    ON CONFLICT (user_id, event_id) DO UPDATE SET dismissed_at = COALESCE(user_activity_receipts.dismissed_at, EXCLUDED.dismissed_at)`,
    [userId, snapshot],
  );
  return { updated: result.rowCount };
}

export async function clearActivityUpdates(userId, snapshot) {
  await assertSavedAccountUser(userId);
  if (!/^\d{1,18}$/.test(String(snapshot)))
    throw badRequest("Invalid notification snapshot.");
  const result = await pool.query(
    `INSERT INTO user_activity_receipts(user_id, event_id, dismissed_at)
     SELECT $1, e.id, NOW()
     ${updateCountScope} AND e.id <= $2 AND (${visibleUpdateFast})
     ON CONFLICT (user_id, event_id) DO UPDATE
       SET dismissed_at = COALESCE(user_activity_receipts.dismissed_at, EXCLUDED.dismissed_at)`,
    [userId, snapshot],
  );
  return { updated: result.rowCount };
}

export async function updateActivityInbox(userId, eventIds, action) {
  await assertSavedAccountUser(userId);
  const ids = [...new Set(eventIds.map(String))];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the source rows: never silently accept a mixed-owner bulk action.
    const { rows } = await client.query(
      "SELECT id FROM user_activity_events WHERE user_id = $1 AND id = ANY($2::bigint[]) FOR SHARE",
      [userId, ids],
    );
    if (rows.length !== ids.length)
      throw badRequest("Some activity items are no longer available.");
    await client.query(
      `INSERT INTO user_activity_receipts (user_id, event_id, dismissed_at)
      SELECT $1, id, CASE WHEN $3 = 'dismiss' THEN NOW() ELSE NULL END FROM unnest($2::bigint[]) AS id
      ON CONFLICT (user_id, event_id) DO UPDATE SET dismissed_at = CASE WHEN $3 = 'dismiss' THEN NOW() ELSE user_activity_receipts.dismissed_at END`,
      [userId, ids, action],
    );
    await client.query("COMMIT");
    return { updated: rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
