import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { badRequest } from "../utils/httpError.js";

const LAB_PREFIX = "notification-lab:";
const LAB_ACCOUNT_NAME = "Notification Lab (local)";

export const notificationLabScenarios = Object.freeze([
  "all",
  "new-game",
  "started-playing",
  "existing-game",
  "unmatched",
  "price-drop",
  "sale-started",
  "sale-ended",
  "wishlist-update",
  "wishlist-removed",
  "purchase-pair",
  "wishlist-priority",
]);

const fixtures = {
  "new-game": {
    appId: "9900000001",
    key: "new-game",
    name: "Echoes of the Lab",
    eventType: "steam_new_game",
    playtimeMinutes: 0,
  },
  "started-playing": {
    appId: "9900000002",
    key: "started-playing",
    name: "Skyline Drift: Lab Edition",
    eventType: "steam_started_playing",
    playtimeMinutes: 146,
  },
  unmatched: {
    appId: "9900000003",
    key: "unmatched",
    name: "Unmatched Lab Cartridge",
    eventType: "steam_new_game",
    playtimeMinutes: 0,
  },
  "existing-game": {
    appId: "9900000004",
    key: "existing-game",
    name: "The Labyrinth Remembers",
    eventType: "steam_status_suggestion",
    playtimeMinutes: 318,
  },
  "price-drop": {
    appId: "9900000005",
    key: "price-drop",
    name: "Garden Signals",
    eventType: "steam_price_drop",
  },
  "sale-started": {
    appId: "9900000007",
    key: "sale-started",
    name: "Moonlit Archive",
    eventType: "steam_sale_started",
  },
  "sale-ended": {
    appId: "9900000008",
    key: "sale-ended",
    name: "Winter Circuit",
    eventType: "steam_sale_ended",
  },
  "wishlist-update": {
    appId: "9900000006",
    key: "wishlist-update",
    name: "The Longest Possible Notification Lab Game Title for Wrapping",
    eventType: "wishlist_added",
  },
  "wishlist-removed": {
    appId: "9900000009",
    key: "wishlist-removed",
    name: "Faded Wishlist Signal",
    eventType: "wishlist_removed",
  },
  "purchase-pair": {
    appId: "9900000010",
    key: "purchase-pair",
    name: "Acquired From the Lab Wishlist",
    eventType: "steam_new_game",
    playtimeMinutes: 0,
  },
  "wishlist-priority": {
    appId: "9900000011",
    key: "wishlist-priority",
    name: "Wishlist order summary",
    eventType: "wishlist_priority_changed",
  },
};

function selectedFixtureKeys(scenario) {
  if (!notificationLabScenarios.includes(scenario)) {
    throw badRequest("Unknown Notification Lab scenario.");
  }
  return scenario === "all"
    ? Object.keys(fixtures)
    : [scenario];
}

function catalogMarker(key) {
  return `${LAB_PREFIX}catalog:${key}`;
}

function labSteamId(userId) {
  return `7656119${String(userId).padStart(10, "0")}`;
}

async function createCatalogFixture(client, fixture) {
  const slug = `notification-lab-${fixture.key}`;
  const existing = await client.query(
    `SELECT catalog.id
       FROM external_game_ids external_id
       JOIN catalog_games catalog ON catalog.id = external_id.catalog_game_id
      WHERE external_id.source = 'manual' AND external_id.external_id = $1
      LIMIT 1`,
    [catalogMarker(fixture.key)],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await client.query(
    `INSERT INTO catalog_games (
      name, canonical_title, slug, metadata_source, metadata_quality,
      genres_json, stores_json, tags_json
    ) VALUES ($1, $1, $2, 'notification_lab', 'full', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
    RETURNING id`,
    [fixture.name, slug],
  );
  const catalogGameId = rows[0].id;
  await client.query(
    `INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
     VALUES ($1, 'manual', $2, $3)`,
    [catalogGameId, catalogMarker(fixture.key), slug],
  );
  return catalogGameId;
}

async function ensureLabAccount(client, userId) {
  const current = await client.query(
    `SELECT id, provider_user_id
       FROM user_external_accounts
      WHERE user_id = $1 AND provider = 'steam' AND disconnected_at IS NULL
      FOR UPDATE`,
    [userId],
  );
  if (current.rows[0]) {
    return {
      id: current.rows[0].id,
      providerUserId: current.rows[0].provider_user_id,
      created: false,
    };
  }

  const created = await client.query(
    `INSERT INTO user_external_accounts (
      user_id, provider, provider_user_id, display_name, profile_url,
      sync_status, linked_at
    ) VALUES ($1, 'steam', $2, $3, 'https://steamcommunity.com/', 'synced', NOW())
    RETURNING id`,
    [userId, labSteamId(userId), LAB_ACCOUNT_NAME],
  );
  return {
    id: created.rows[0].id,
    providerUserId: labSteamId(userId),
    created: true,
  };
}

async function createRunAndJob(client, userId, account, scenario) {
  const run = await client.query(
    `INSERT INTO integration_sync_runs (
      user_id, provider, sync_kind, trigger_type, status, finished_at, summary_json
    ) VALUES ($1, 'steam', 'library', 'manual', 'succeeded', NOW(), $2::jsonb)
    RETURNING id`,
    [userId, JSON.stringify({ notificationLab: true, scenario })],
  );
  await client.query(
    `INSERT INTO steam_sync_jobs (
      id, user_id, account_id, trigger_type, sync_kind, sync_run_id, status,
      force, started_at, completed_at, payload_json, result_json, provider_user_id
    ) VALUES ($1, $2, $3, 'manual', 'library', $4, 'completed', true, NOW(), NOW(), $5::jsonb, $5::jsonb, $6)`,
    [
      randomUUID(),
      userId,
      account.id,
      run.rows[0].id,
      JSON.stringify({ notificationLab: true, scenario }),
      account.providerUserId,
    ],
  );
  return run.rows[0].id;
}

async function createSteamSource(client, userId, fixture, catalogGameId, gameId = null) {
  await client.query(
    `INSERT INTO user_game_sources (
      user_id, game_id, catalog_game_id, provider, provider_app_id, relationship,
      source_status, playtime_minutes_forever, last_played_at,
      first_play_observed_at, first_play_observed_playtime_minutes, last_synced_at
    ) VALUES (
      $1, $2, $3, 'steam', $4, 'owned', 'owned', $5,
      CASE WHEN $5 > 0 THEN NOW() - INTERVAL '2 hours' ELSE NULL END,
      CASE WHEN $5 > 0 THEN NOW() - INTERVAL '3 days' ELSE NULL END,
      CASE WHEN $5 > 0 THEN $5 ELSE NULL END, NOW()
    )`,
    [userId, gameId, catalogGameId, fixture.appId, fixture.playtimeMinutes || 0],
  );
}

async function createCandidate(client, userId, fixture, catalogGameId) {
  const { rows } = await client.query(
    `INSERT INTO steam_import_candidates (
      user_id, steam_app_id, steam_name, playtime_minutes_forever, last_played_at,
      proposed_catalog_game_id, match_confidence, match_reason,
      suggested_status, suggested_status_reason, suggested_status_confidence
    ) VALUES ($1, $2, $3, $4,
      CASE WHEN $4 > 0 THEN NOW() - INTERVAL '2 hours' ELSE NULL END,
      $5, $6, $7, $8, $9, 'high'
    ) RETURNING id`,
    [
      userId,
      fixture.appId,
      fixture.name,
      fixture.playtimeMinutes || 0,
      catalogGameId,
      catalogGameId ? "exact" : "none",
      catalogGameId ? "Notification Lab catalog fixture." : "Notification Lab unmatched fixture.",
      fixture.eventType === "steam_started_playing" ? "playing" : "plan to play",
      fixture.eventType === "steam_started_playing"
        ? "Steam shows play activity."
        : "No Steam playtime observed.",
    ],
  );
  return rows[0].id;
}

async function createEvent(client, {
  userId,
  runId,
  fixture,
  catalogGameId = null,
  gameId = null,
  eventKind = "decision",
  state = "open",
  payload = {},
  eventType = fixture.eventType,
  keySuffix = eventType,
}) {
  await client.query(
    `INSERT INTO user_activity_events (
      user_id, source, event_type, game_id, catalog_game_id, external_id,
      sync_run_id, dedupe_key, occurrence_key, event_kind, payload_json, state,
      observed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10::jsonb, $11, NOW())`,
    [
      userId,
      eventType.startsWith("steam_price") || eventType.startsWith("steam_sale")
        ? "steam_prices"
        : eventType.startsWith("wishlist_")
          ? "steam_wishlist"
          : "steam_library",
      eventType,
      gameId,
      catalogGameId,
      fixture.appId,
      runId,
      `${LAB_PREFIX}event:${fixture.key}:${keySuffix}`,
      eventKind,
      JSON.stringify({
        steamAppId: fixture.appId,
        steamName: fixture.name,
        playtimeMinutes: fixture.playtimeMinutes || 0,
        ...payload,
      }),
      state,
    ],
  );
}

async function labCatalogIds(client) {
  const { rows } = await client.query(
    `SELECT catalog_game_id AS id
       FROM external_game_ids
      WHERE source = 'manual' AND external_id LIKE $1`,
    [`${LAB_PREFIX}catalog:%`],
  );
  return rows.map((row) => Number(row.id));
}

async function resetNotificationLabTx(client, userId) {
  const catalogIds = await labCatalogIds(client);
  const labGames = catalogIds.length
    ? await client.query(
      `SELECT g.id
         FROM games g
         JOIN catalog_games catalog ON catalog.id = g.catalog_game_id
        WHERE g.user_id = $1
          AND g.catalog_game_id = ANY($2::int[])
          AND g.name = catalog.name
          AND catalog.slug LIKE 'notification-lab-%'`,
      [userId, catalogIds],
    )
    : { rows: [] };

  await client.query(
    `DELETE FROM user_activity_events
      WHERE user_id = $1 AND dedupe_key LIKE $2`,
    [userId, `${LAB_PREFIX}%`],
  );
  await client.query(
    `DELETE FROM steam_import_candidates
      WHERE user_id = $1 AND steam_app_id LIKE '990000000%'`,
    [userId],
  );
  await client.query(
    `DELETE FROM user_game_sources
      WHERE user_id = $1 AND provider = 'steam' AND provider_app_id LIKE '990000000%'`,
    [userId],
  );
  if (labGames.rows.length) {
    await client.query(
      "DELETE FROM games WHERE user_id = $1 AND id = ANY($2::int[])",
      [userId, labGames.rows.map((row) => Number(row.id))],
    );
  }
  await client.query(
    `DELETE FROM steam_sync_jobs
      WHERE user_id = $1 AND payload_json->>'notificationLab' = 'true'`,
    [userId],
  );
  await client.query(
    `DELETE FROM integration_sync_runs
      WHERE user_id = $1 AND summary_json->>'notificationLab' = 'true'`,
    [userId],
  );
  if (catalogIds.length) {
    await client.query(
      `DELETE FROM catalog_games catalog
        WHERE catalog.id = ANY($1::int[])
          AND NOT EXISTS (SELECT 1 FROM games WHERE catalog_game_id = catalog.id)
          AND NOT EXISTS (SELECT 1 FROM user_game_sources WHERE catalog_game_id = catalog.id)
          AND NOT EXISTS (SELECT 1 FROM steam_import_candidates WHERE proposed_catalog_game_id = catalog.id
            OR user_selected_catalog_game_id = catalog.id)`,
      [catalogIds],
    );
  }
  const removedAccount = await client.query(
    `DELETE FROM user_external_accounts
      WHERE user_id = $1 AND provider = 'steam' AND provider_user_id = $2
        AND display_name = $3
      RETURNING id`,
    [userId, labSteamId(userId), LAB_ACCOUNT_NAME],
  );
  return {
    removedGames: labGames.rows.length,
    removedLabAccount: Boolean(removedAccount.rows[0]),
  };
}

async function localPlayableStatus(client) {
  const { rows } = await client.query(
    `SELECT status FROM statuses
      WHERE LOWER(TRIM(status)) NOT IN ('playing', 'finished', 'completed')
      ORDER BY CASE WHEN LOWER(TRIM(status)) = 'plan to play' THEN 0 ELSE 1 END, rank
      LIMIT 1`,
  );
  if (!rows[0]?.status) throw badRequest("Create a non-playing Backlog status before using Notification Lab.");
  return rows[0].status;
}

export async function seedNotificationLab(userId, scenario = "all") {
  const selected = selectedFixtureKeys(scenario);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await resetNotificationLabTx(client, userId);
    const account = await ensureLabAccount(client, userId);
    const runId = await createRunAndJob(client, userId, account, scenario);
    const seeded = [];

    for (const key of selected) {
      const fixture = fixtures[key];
      if (key === "unmatched") {
        await createSteamSource(client, userId, fixture, null);
        await createCandidate(client, userId, fixture, null);
        await createEvent(client, { userId, runId, fixture });
      } else if (key === "existing-game") {
        const catalogGameId = await createCatalogFixture(client, fixture);
        const status = await localPlayableStatus(client);
        const game = await client.query(
          `INSERT INTO games (user_id, catalog_game_id, name, status, position)
           VALUES ($1, $2, $3, $4, 999999)
           RETURNING id`,
          [userId, catalogGameId, fixture.name, status],
        );
        await createSteamSource(client, userId, fixture, catalogGameId, game.rows[0].id);
        await createEvent(client, {
          userId,
          runId,
          fixture,
          catalogGameId,
          gameId: game.rows[0].id,
          payload: { gameId: game.rows[0].id, currentStatus: status },
        });
      } else if (["sale-started", "sale-ended"].includes(key)) {
        const catalogGameId = await createCatalogFixture(client, fixture);
        const saleStarted = key === "sale-started";
        const previousMinor = saleStarted ? 12900 : 7900;
        const currentMinor = saleStarted ? 7900 : 12900;
        const groupKey = `${LAB_PREFIX}price:${fixture.key}`;
        await createEvent(client, {
          userId,
          runId,
          fixture,
          catalogGameId,
          eventKind: "fact",
          state: "resolved",
          eventType: saleStarted ? "steam_price_drop" : "steam_price_increase",
          keySuffix: "price",
          payload: { groupKey, currency: "ILS", previousMinor, currentMinor },
        });
        await createEvent(client, {
          userId,
          runId,
          fixture,
          catalogGameId,
          eventKind: "fact",
          state: "resolved",
          eventType: saleStarted ? "steam_sale_started" : "steam_sale_ended",
          keySuffix: "sale",
          payload: { groupKey, currency: "ILS", previousMinor, currentMinor },
        });
      } else if (key === "purchase-pair") {
        const catalogGameId = await createCatalogFixture(client, fixture);
        await createSteamSource(client, userId, fixture, catalogGameId);
        await createCandidate(client, userId, fixture, catalogGameId);
        await createEvent(client, { userId, runId, fixture, catalogGameId });
        await createEvent(client, {
          userId,
          runId,
          fixture,
          catalogGameId,
          eventType: "wishlist_likely_purchased",
          keySuffix: "wishlist-removal",
        });
      } else if (key === "wishlist-priority") {
        await createEvent(client, {
          userId,
          runId,
          fixture,
          payload: {
            changes: [
              { steamAppId: "9900000101", from: 8, to: 2 },
              { steamAppId: "9900000102", from: 3, to: 7 },
            ],
          },
        });
      } else if (["price-drop", "wishlist-update", "wishlist-removed"].includes(key)) {
        const catalogGameId = await createCatalogFixture(client, fixture);
        await createEvent(client, {
          userId,
          runId,
          fixture,
          catalogGameId,
          eventKind: key === "price-drop" ? "fact" : "decision",
          state: key === "price-drop" ? "resolved" : "open",
          payload: key === "price-drop"
            ? { currency: "ILS", previousMinor: 12900, currentMinor: 7900 }
            : {},
        });
      } else {
        const catalogGameId = await createCatalogFixture(client, fixture);
        await createSteamSource(client, userId, fixture, catalogGameId);
        await createCandidate(client, userId, fixture, catalogGameId);
        await createEvent(client, { userId, runId, fixture, catalogGameId });
      }
      seeded.push(key);
    }
    await client.query("COMMIT");
    return { seeded, createdLabAccount: account.created };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resetNotificationLab(userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await resetNotificationLabTx(client, userId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
