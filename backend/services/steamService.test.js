import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db.js";
import {
  applySteamStatusSuggestion,
  attachSteamCandidateToGame,
  beginSteamLink,
  bestTitleSimilarity,
  consumeSteamLink,
  disconnectSteamAccount,
  enqueueSteamSync,
  getSteamSyncJob,
  importSteamCandidates,
  isLikelySteamDuplicateTitle,
  likelyFilteredReason,
  listSteamImportCandidates,
  mergeBacklogDuplicateGames,
  normalizeOwnedGamesPayload,
  normalizeSteamAchievementSummary,
  steamCandidateOrderBy,
  summarizeAchievementSyncResults,
  syncSteamAchievementsForGame,
  titleVariants,
  unlinkSteamAppFromGame,
  updateSteamImportCandidate,
  upsertSteamAccount,
} from "./steamService.js";

async function withMockClient(queryImpl, fn) {
  const originalConnect = pool.connect;
  const calls = [];
  const client = {
    query: async (text, values) => {
      calls.push({ text: String(text), values });
      return queryImpl(String(text), values, calls);
    },
    release: () => {
      calls.push({ text: "RELEASE", values: undefined });
    },
  };
  pool.connect = async () => client;
  try {
    return await fn(calls);
  } finally {
    pool.connect = originalConnect;
  }
}

async function withMockPoolQuery(queryImpl, fn) {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (text, values) => {
    calls.push({ text: String(text), values });
    return queryImpl(String(text), values, calls);
  };
  try {
    return await fn(calls);
  } finally {
    pool.query = originalQuery;
  }
}

function compact(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

test("Steam link transactions bind signed state to a one-time browser nonce", async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "steam-link-test-secret";
  let transaction;
  try {
    await withMockPoolQuery(
      async (text, values) => {
        assert.match(compact(text), /^INSERT INTO steam_link_transactions/);
        assert.equal(values[1], 7);
        assert.match(values[0], /^[0-9a-f-]{36}$/);
        assert.match(values[2], /^[0-9a-f]{64}$/);
        return { rows: [] };
      },
      async () => {
        transaction = await beginSteamLink(7);
      }
    );

    const providerUrl = new URL(transaction.url);
    const returnTo = new URL(providerUrl.searchParams.get("openid.return_to"));
    const state = returnTo.searchParams.get("state");

    await withMockPoolQuery(
      async (text, values) => {
        assert.match(compact(text), /^UPDATE steam_link_transactions SET consumed_at/);
        assert.match(values[0], /^[0-9a-f-]{36}$/);
        assert.match(values[1], /^[0-9a-f]{64}$/);
        return { rows: [{ user_id: 7 }] };
      },
      async () => {
        assert.equal(await consumeSteamLink(state, transaction.nonce), 7);
      }
    );

    await withMockPoolQuery(
      async () => ({ rows: [] }),
      async () => {
        await assert.rejects(
          consumeSteamLink(state, "wrong-browser-nonce"),
          /expired or was already used/
        );
      }
    );
  } finally {
    if (originalSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("upsertSteamAccount refuses to displace another user's active link", async () => {
  await withMockClient(
    async (text) => {
      const sql = compact(text);
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.startsWith("SELECT user_id FROM user_external_accounts")) {
        return { rows: [{ user_id: 99 }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async (calls) => {
      await assert.rejects(
        upsertSteamAccount(7, "76561198000000000"),
        /already linked to another account/
      );
      assert.equal(calls.some((call) => compact(call.text) === "ROLLBACK"), true);
    }
  );
});

test("Steam sync enqueue returns a durable job and job reads stay user scoped", async () => {
  const jobRow = {
    id: "40f1f5c4-0fe4-4b66-a953-4a58397fc875",
    user_id: 7,
    account_id: 12,
    status: "queued",
    cursor: 0,
    total: null,
    progress_json: {},
    created_at: new Date().toISOString(),
  };
  await withMockPoolQuery(
    async (text, values) => {
      const sql = compact(text);
      if (sql.startsWith("SELECT * FROM user_external_accounts")) {
        assert.deepEqual(values, [7]);
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              provider: "steam",
              provider_user_id: "76561198000000000",
            },
          ],
        };
      }
      if (sql.startsWith("INSERT INTO steam_sync_jobs")) {
        assert.equal(values[1], 7);
        assert.equal(values[2], 12);
        assert.equal(values[3], false);
        return { rows: [{ ...jobRow, id: values[0] }] };
      }
      if (sql.startsWith("SELECT * FROM steam_sync_jobs WHERE id")) {
        assert.deepEqual(values, [jobRow.id, 7]);
        return { rows: [jobRow] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async () => {
      const queued = await enqueueSteamSync(7);
      assert.match(queued.id, /^[0-9a-f-]{36}$/);
      assert.equal(queued.status, "queued");
      const fetched = await getSteamSyncJob(7, jobRow.id);
      assert.equal(fetched.id, jobRow.id);
      assert.equal(fetched.status, "queued");
    },
  );
});

test("normalizeOwnedGamesPayload maps Steam owned library rows", () => {
  const rows = normalizeOwnedGamesPayload({
    response: {
      games: [
        {
          appid: 123,
          name: "Hades",
          img_icon_url: "abc",
          playtime_forever: 615,
          rtime_last_played: 1_700_000_000,
        },
      ],
    },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].appid, "123");
  assert.equal(rows[0].name, "Hades");
  assert.equal(rows[0].playtimeMinutes, 615);
  assert.equal(rows[0].iconUrl.includes("/123/abc.jpg"), true);
  assert.equal(rows[0].lastPlayedAt, "2023-11-14T22:13:20.000Z");
});

test("normalizeOwnedGamesPayload tolerates private or empty libraries", () => {
  assert.deepEqual(normalizeOwnedGamesPayload({ response: {} }), []);
  assert.deepEqual(normalizeOwnedGamesPayload(null), []);
});

test("normalizeOwnedGamesPayload keeps app ids even when Steam omits names", () => {
  const rows = normalizeOwnedGamesPayload({
    response: {
      games: [{ appid: "456", playtime_forever: "12" }],
    },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Steam App 456");
  assert.equal(rows[0].playtimeMinutes, 12);
});

test("normalizeSteamAchievementSummary maps player and schema counts", () => {
  const summary = normalizeSteamAchievementSummary(
    {
      playerstats: {
        success: true,
        achievements: [
          { apiname: "a", achieved: 1 },
          { apiname: "b", achieved: 0 },
          { apiname: "c", achieved: 1 },
        ],
      },
    },
    {
      game: {
        availableGameStats: {
          achievements: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }],
        },
      },
    }
  );

  assert.equal(summary.status, "synced");
  assert.equal(summary.unlocked, 2);
  assert.equal(summary.total, 4);
  assert.equal(summary.percent, 50);
});

test("normalizeSteamAchievementSummary handles games with no achievements", () => {
  const summary = normalizeSteamAchievementSummary(
    { playerstats: { success: false, error: "no stats" } },
    { game: { availableGameStats: { achievements: [] } } }
  );

  assert.equal(summary.status, "none");
  assert.equal(summary.unlocked, 0);
  assert.equal(summary.total, 0);
  assert.equal(summary.percent, null);
});

test("normalizeSteamAchievementSummary handles private player achievement data", () => {
  const summary = normalizeSteamAchievementSummary(
    { playerstats: { success: false, error: "Profile is private" } },
    { game: { availableGameStats: { achievements: [{ name: "a" }] } } }
  );

  assert.equal(summary.status, "private");
  assert.equal(summary.total, 1);
  assert.equal(summary.percent, null);
});

test("syncSteamAchievementsForGame skips recently synced rows and scopes by user", async () => {
  const recent = new Date().toISOString();
  await withMockPoolQuery(
    async (text, values) => {
      const sql = compact(text);
      if (sql.includes("FROM user_game_sources ugs") && sql.includes("ugs.game_id = $2")) {
        assert.deepEqual(values, [7, 31]);
        return {
          rows: [
            {
              id: 5,
              user_id: 7,
              game_id: 31,
              provider: "steam",
              provider_app_id: "367520",
              achievements_status: "synced",
              achievements_unlocked: 12,
              achievements_total: 20,
              achievements_percent: "60.00",
              achievements_last_synced_at: recent,
              achievements_last_error_code: null,
              achievements_last_error_message: null,
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async (calls) => {
      const result = await syncSteamAchievementsForGame(7, 31);

      assert.equal(result.skipped, true);
      assert.equal(result.reason, "cooldown");
      assert.equal(result.achievements.status, "synced");
      assert.equal(result.achievements.percent, 60);
      assert.equal(
        calls.some((call) => call.text.includes("UPDATE user_game_sources")),
        false
      );
    }
  );
});

test("summarizeAchievementSyncResults separates synced, empty, unavailable, failed, and skipped states", () => {
  const summary = summarizeAchievementSyncResults([
    { achievements: { status: "synced" } },
    { achievements: { status: "none" } },
    { achievements: { status: "private" } },
    { achievements: { status: "unavailable" } },
    { achievements: { status: "failed" }, failed: true },
    { skipped: true, achievements: { status: "synced" } },
  ]);

  assert.equal(summary.synced, 1);
  assert.equal(summary.none, 1);
  assert.equal(summary.private, 1);
  assert.equal(summary.unavailable, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.skipped, 1);
  assert.deepEqual(summary.statusCounts, {
    synced: 1,
    none: 1,
    private: 1,
    unavailable: 1,
    failed: 1,
    skipped: 1,
  });
});

test("steamCandidateOrderBy only returns whitelisted order clauses", () => {
  assert.match(compact(steamCandidateOrderBy()), /CASE WHEN c\.filtered_reason IS NULL/);
  assert.match(compact(steamCandidateOrderBy("suggested")), /first_play_observed_at/);
  assert.match(compact(steamCandidateOrderBy("suggested")), /c\.created_at DESC/);
  assert.match(compact(steamCandidateOrderBy("newly_synced")), /c\.created_at DESC/);
  assert.match(compact(steamCandidateOrderBy("playtime_desc")), /playtime_minutes_forever.*DESC/);
  assert.match(compact(steamCandidateOrderBy("achievement_desc")), /achievements_percent DESC/);
  assert.match(compact(steamCandidateOrderBy("backlog_state")), /CASE c\.import_status/);
  assert.equal(
    compact(steamCandidateOrderBy("c.steam_name; DROP TABLE users;")),
    compact(steamCandidateOrderBy("suggested"))
  );
});

test("titleVariants strip common Steam edition suffixes", () => {
  assert.deepEqual(
    new Set(titleVariants("Control Ultimate Edition")),
    new Set(["control ultimate edition", "control"])
  );
  assert.deepEqual(
    new Set(titleVariants("Death Stranding Director's Cut")),
    new Set(["death stranding directors cut", "death stranding"])
  );
  assert.deepEqual(
    new Set(titleVariants("Mass Effect Legendary Edition")),
    new Set(["mass effect legendary edition", "mass effect"])
  );
  assert.deepEqual(
    new Set(titleVariants("Disco Elysium Final Cut")),
    new Set(["disco elysium final cut", "disco elysium"])
  );
  assert.deepEqual(
    new Set(titleVariants("NieR:Automata Game of the YoRHa Edition")),
    new Set(["nier automata game of the yorha edition", "nier automata"])
  );
  assert.deepEqual(
    new Set(titleVariants("Quantum Break Windows Edition")),
    new Set(["quantum break windows edition", "quantum break"])
  );
});

test("titleVariants add roman numeral and number forms", () => {
  assert.equal(titleVariants("Final Fantasy VII Remake").includes("final fantasy 7 remake"), true);
  assert.equal(titleVariants("Baldur's Gate 3").includes("baldurs gate iii"), true);
});

test("bestTitleSimilarity handles edition and roman numeral variants", () => {
  assert.equal(bestTitleSimilarity("Mass Effect Legendary Edition", "Mass Effect") >= 0.9, true);
  assert.equal(bestTitleSimilarity("Final Fantasy VII", "Final Fantasy 7") >= 0.9, true);
  assert.equal(bestTitleSimilarity("Hades II", "Hades 2") >= 0.9, true);
});

test("isLikelySteamDuplicateTitle accepts Steam edition and punctuation variants", () => {
  assert.equal(isLikelySteamDuplicateTitle("Control Ultimate Edition", "Control"), true);
  assert.equal(isLikelySteamDuplicateTitle("Death Stranding Director's Cut", "Death Stranding"), true);
  assert.equal(isLikelySteamDuplicateTitle("Baldur's Gate III", "Baldurs Gate 3"), true);
  assert.equal(isLikelySteamDuplicateTitle("FINAL FANTASY VII", "Final Fantasy 7"), true);
});

test("isLikelySteamDuplicateTitle does not collapse distinct sequels", () => {
  assert.equal(isLikelySteamDuplicateTitle("Hades", "Hades II"), false);
  assert.equal(isLikelySteamDuplicateTitle("Portal", "Portal 2"), false);
  assert.equal(isLikelySteamDuplicateTitle("Half-Life", "Half-Life 2"), false);
});

test("likelyFilteredReason catches common non-game Steam app variants", () => {
  assert.equal(likelyFilteredReason("Some Game - Season Pass"), "steam_dlc");
  assert.equal(likelyFilteredReason("Some Game High Resolution Texture Pack"), "steam_bonus_content");
  assert.equal(likelyFilteredReason("Some Game Public Test Server"), "steam_playtest");
  assert.equal(likelyFilteredReason("Some Game Soundtrack"), "steam_soundtrack");
  assert.equal(likelyFilteredReason("Some Full Game"), null);
});

test("updateSteamImportCandidate hides and restores both candidate and source rows", async () => {
  await withMockClient(
    async (text, values) => {
      const sql = compact(text);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.startsWith("UPDATE steam_import_candidates SET import_status = 'ignored'")) {
        assert.deepEqual(values, [12, 7]);
        return {
          rows: [
            {
              id: 12,
              steam_app_id: "123",
              steam_name: "Hidden Game",
              import_status: "ignored",
            },
          ],
        };
      }
      if (sql.startsWith("UPDATE user_game_sources SET source_status = 'ignored'")) {
        assert.deepEqual(values, [7, 12]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE steam_import_candidates SET import_status = 'pending'")) {
        assert.deepEqual(values, [12, 7]);
        return {
          rows: [
            {
              id: 12,
              steam_app_id: "123",
              steam_name: "Hidden Game",
              import_status: "pending",
            },
          ],
        };
      }
      if (sql.startsWith("UPDATE user_game_sources SET source_status = 'owned'")) {
        assert.deepEqual(values, [7, 12]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async (calls) => {
      const hidden = await updateSteamImportCandidate(7, 12, "ignore");
      const restored = await updateSteamImportCandidate(7, 12, "restore");

      assert.equal(hidden.importStatus, "ignored");
      assert.equal(restored.importStatus, "pending");
      assert.equal(
        calls.some((call) => compact(call.text).includes("source_status = 'ignored'")),
        true
      );
      assert.equal(
        calls.some((call) => compact(call.text).includes("source_status = 'owned'")),
        true
      );
    }
  );
});

test("likelyFilteredReason flags common non-game Steam apps", () => {
  assert.equal(likelyFilteredReason("Some Game - Dedicated Server"), "steam_server");
  assert.equal(likelyFilteredReason("Some Game Playtest"), "steam_playtest");
  assert.equal(likelyFilteredReason("Some Game Artbook"), "steam_bonus_content");
  assert.equal(likelyFilteredReason("Some Game SDK"), "steam_tool");
  assert.equal(likelyFilteredReason("Demon Tilt"), null);
  assert.equal(likelyFilteredReason("Trials Rising"), null);
  assert.equal(likelyFilteredReason("Some Game Prologue"), "steam_demo");
  assert.equal(likelyFilteredReason("Some Game Documentary"), "steam_media");
});

test("Steam review transactions roll back when a related source write fails", async () => {
  await withMockClient(
    async (text) => {
      const sql = compact(text);
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.startsWith("UPDATE steam_import_candidates")) {
        return {
          rows: [{ id: 12, steam_app_id: "123", steam_name: "Game", import_status: "ignored" }],
        };
      }
      if (sql.startsWith("UPDATE user_game_sources")) {
        throw new Error("injected source failure");
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async (calls) => {
      await assert.rejects(
        updateSteamImportCandidate(7, 12, "ignore"),
        /injected source failure/,
      );
      assert.equal(calls.some((call) => compact(call.text) === "ROLLBACK"), true);
      assert.equal(calls.some((call) => compact(call.text) === "COMMIT"), false);
    },
  );
});

test("disconnectSteamAccount updates account and sources in one transaction", async () => {
  await withMockClient(
    async (text) => {
      const sql = compact(text);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.startsWith("UPDATE user_external_accounts")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("UPDATE user_game_sources")) return { rows: [], rowCount: 2 };
      throw new Error(`Unexpected query: ${sql}`);
    },
    async (calls) => {
      assert.deepEqual(await disconnectSteamAccount(7), { account: null });
      assert.equal(compact(calls[0].text), "BEGIN");
      assert.equal(compact(calls.at(-2).text), "COMMIT");
    },
  );
});

test("listSteamImportCandidates group filters match exclusive summary piles", async () => {
  await withMockPoolQuery(
    async (text) => {
      const sql = compact(text);
      if (sql.startsWith("SELECT c.id, c.steam_name")) return { rows: [] };
      if (sql.startsWith("SELECT COUNT(*)")) return { rows: [{ total: 0 }] };
      return { rows: [] };
    },
    async (calls) => {
      await listSteamImportCandidates(7, { group: "needs_match" });
      await listSteamImportCandidates(7, { group: "matched" });
      await listSteamImportCandidates(7, { group: "newly_played" });

      const countQueries = calls
        .map((call) => compact(call.text))
        .filter((sql) => sql.startsWith("SELECT COUNT(*)"));
      const needsMatchSql = countQueries[0];
      const matchedSql = countQueries[1];
      const newlyPlayedSql = countQueries[2];

      assert.match(needsMatchSql, /c\.filtered_reason IS NULL/);
      assert.match(needsMatchSql, /c\.duplicate_game_id IS NULL/);
      assert.match(
        needsMatchSql,
        /c\.proposed_catalog_game_id IS NULL AND c\.user_selected_catalog_game_id IS NULL/
      );
      assert.match(matchedSql, /c\.filtered_reason IS NULL/);
      assert.match(matchedSql, /c\.duplicate_game_id IS NULL/);
      assert.match(matchedSql, /ugs\.first_play_observed_at IS NULL/);
      assert.match(matchedSql, /NOT IN \('plan to play', 'played a bit', 'playing'/);
      assert.match(newlyPlayedSql, /ugs\.first_play_observed_at IS NOT NULL/);
      assert.match(newlyPlayedSql, /c\.duplicate_game_id IS NULL/);
    }
  );
});

test("applySteamStatusSuggestion updates only a Steam-linked game", async () => {
  await withMockPoolQuery(
    async (text, values) => {
      const sql = compact(text);
      if (sql.startsWith("UPDATE games g SET status = $3")) {
        assert.deepEqual(values, [42, 7, "playing", true, "2026-07-03"]);
        assert.match(sql, /EXISTS \( SELECT 1 FROM user_game_sources ugs/);
        assert.doesNotMatch(sql, /updated_at/);
        return {
          rows: [
            {
              id: 42,
              name: "Hades",
              status: "playing",
              started_at: "2026-07-03",
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async () => {
      const payload = await applySteamStatusSuggestion(7, 42, {
        status: "playing",
        setStartedAt: true,
        startedAt: "2026-07-03T10:00:00.000Z",
      });

      assert.equal(payload.game.id, 42);
      assert.equal(payload.game.status, "playing");
      assert.equal(payload.game.startedAt, "2026-07-03");
    }
  );
});

test("importSteamCandidates attaches marked duplicates instead of creating a new game", async () => {
  await withMockClient(
    async (text, values) => {
      const sql = compact(text);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("FROM steam_import_candidates") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: 10,
              user_id: 7,
              steam_app_id: "1145360",
              steam_name: "Hades",
              playtime_minutes_forever: 9000,
              last_played_at: "2026-06-01T00:00:00.000Z",
              proposed_catalog_game_id: 55,
              user_selected_catalog_game_id: null,
              duplicate_game_id: 22,
              suggested_status: "finished",
              selected_status: null,
              filtered_reason: null,
            },
          ],
        };
      }
      if (sql.includes("SELECT id, name FROM games WHERE id = $1")) {
        assert.deepEqual(values, [22, 7]);
        return { rows: [{ id: 22, name: "Hades" }] };
      }
      return { rows: [] };
    },
    async (calls) => {
      const result = await importSteamCandidates(7, [10]);

      assert.deepEqual(result.imported, []);
      assert.deepEqual(result.attached, [10]);
      assert.deepEqual(result.skipped, []);
      assert.equal(calls.some((call) => call.text.includes("INSERT INTO games")), false);

      const sourceUpdate = calls.find((call) =>
        call.text.includes("UPDATE user_game_sources") && call.text.includes("SET game_id = $3")
      );
      assert.deepEqual(sourceUpdate.values, [7, "1145360", 22, 55]);

      const candidateUpdate = calls.find((call) =>
        call.text.includes("UPDATE steam_import_candidates") &&
        call.text.includes("import_status = 'attached'")
      );
      assert.deepEqual(candidateUpdate.values, [10, 7, 22]);
    }
  );
});

test("attachSteamCandidateToGame moves a Steam link and preserves stronger source data", async () => {
  await withMockClient(
    async (text) => {
      const sql = compact(text);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("FROM games WHERE id = $1 AND user_id = $2 FOR UPDATE")) {
        return { rows: [{ id: 31, catalog_game_id: null }] };
      }
      if (sql.includes("FROM steam_import_candidates") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: 12,
              steam_app_id: "367520",
              steam_name: "Hollow Knight",
              playtime_minutes_forever: 3600,
              last_played_at: "2026-05-01T00:00:00.000Z",
              proposed_catalog_game_id: 77,
              user_selected_catalog_game_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (calls) => {
      const result = await attachSteamCandidateToGame(7, 12, 31);

      assert.deepEqual(result, { attached: true, candidateId: 12, gameId: 31 });
      const sourceUpsert = calls.find((call) => call.text.includes("INSERT INTO user_game_sources"));
      assert.match(sourceUpsert.text, /ON CONFLICT \(user_id, provider, provider_app_id\)/);
      assert.match(sourceUpsert.text, /game_id = EXCLUDED\.game_id/);
      assert.match(sourceUpsert.text, /playtime_minutes_forever = GREATEST/);
      assert.match(sourceUpsert.text, /last_played_at = GREATEST/);
      assert.deepEqual(sourceUpsert.values, [
        7,
        "367520",
        31,
        77,
        3600,
        "2026-05-01T00:00:00.000Z",
      ]);

      const candidateUpdate = calls.find((call) =>
        call.text.includes("UPDATE steam_import_candidates") &&
        call.text.includes("import_status = 'attached'")
      );
      assert.deepEqual(candidateUpdate.values, [12, 7, 31]);
      assert.equal(
        calls.some((call) => call.text.includes("INSERT INTO external_game_ids")),
        false
      );
    }
  );
});

test("unlinkSteamAppFromGame detaches the source and reopens attached import candidates", async () => {
  await withMockClient(
    async (text) => {
      const sql = compact(text);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("SELECT id FROM games WHERE id = $1 AND user_id = $2 FOR UPDATE")) {
        return { rows: [{ id: 31 }] };
      }
      if (sql.includes("UPDATE user_game_sources")) {
        return { rows: [{ provider_app_id: "367520" }] };
      }
      return { rows: [] };
    },
    async (calls) => {
      const result = await unlinkSteamAppFromGame(7, 31, "367520");

      assert.deepEqual(result, { unlinked: true, gameId: 31, steamAppId: "367520" });
      const sourceUpdate = calls.find((call) => call.text.includes("UPDATE user_game_sources"));
      assert.match(sourceUpdate.text, /SET game_id = NULL/);
      assert.match(sourceUpdate.text, /AND game_id = \$3/);
      assert.deepEqual(sourceUpdate.values, [7, "367520", 31]);

      const candidateUpdate = calls.find((call) =>
        call.text.includes("UPDATE steam_import_candidates")
      );
      assert.match(candidateUpdate.text, /WHEN import_status = 'attached' THEN 'pending'/);
      assert.match(candidateUpdate.text, /duplicate_game_id = NULL/);
      assert.deepEqual(candidateUpdate.values, [7, "367520"]);
    }
  );
});

test("mergeBacklogDuplicateGames moves Steam links before deleting duplicate rows", async () => {
  await withMockClient(
    async (text) => {
      const sql = compact(text);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("SELECT * FROM games") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: 41,
              catalog_game_id: null,
              my_genre: "Roguelike",
              how_long_to_beat: null,
              my_score: null,
              thoughts: "",
              rawg_id: null,
              rawg_slug: null,
              favorite_rank: null,
              started_at: null,
              finished_at: null,
            },
            {
              id: 42,
              catalog_game_id: 99,
              my_genre: "Action",
              how_long_to_beat: 20,
              my_score: 9,
              thoughts: "keep this note",
              rawg_id: 123,
              rawg_slug: "hades",
              favorite_rank: 3,
              started_at: "2026-01-01",
              finished_at: "2026-02-01",
            },
          ],
        };
      }
      if (sql.includes("DELETE FROM games")) return { rows: [], rowCount: 1 };
      return { rows: [] };
    },
    async (calls) => {
      const result = await mergeBacklogDuplicateGames(7, 41, [42]);

      assert.deepEqual(result, { keptGameId: 41, removed: 1 });
      const sourceMove = calls.find((call) =>
        call.text.includes("UPDATE user_game_sources") && call.text.includes("game_id = $3")
      );
      assert.deepEqual(sourceMove.values, [7, [42], 41, 99]);

      const candidateMove = calls.find((call) =>
        call.text.includes("UPDATE steam_import_candidates") &&
        call.text.includes("duplicate_game_id = $3")
      );
      assert.deepEqual(candidateMove.values, [7, [42], 41]);

      const listMove = calls.find((call) =>
        call.text.includes("INSERT INTO user_list_games")
      );
      assert.deepEqual(listMove.values, [7, [42], 41]);
      assert.match(listMove.text, /GROUP BY ulg\.list_id/);
      assert.match(listMove.text, /ON CONFLICT \(list_id, game_id\) DO NOTHING/);

      const deleteCall = calls.find((call) => call.text.includes("DELETE FROM games"));
      assert.deepEqual(deleteCall.values, [7, [42]]);
      assert.ok(
        calls.findIndex((call) => call === sourceMove) <
          calls.findIndex((call) => call === deleteCall)
      );
      assert.ok(
        calls.findIndex((call) => call === listMove) <
          calls.findIndex((call) => call === deleteCall)
      );
    }
  );
});
