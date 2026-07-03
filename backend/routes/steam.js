import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { cacheClear } from "../utils/microCache.js";
import { badRequest, notFound } from "../utils/httpError.js";
import {
  attachSteamCandidate as validateAttachSteamCandidate,
  autoMatchSteam as validateAutoMatchSteam,
  bulkSteamCandidates as validateBulkSteamCandidates,
  devLinkSteam as validateDevLinkSteam,
  importSteam as validateImportSteam,
  listSteamImports as validateListSteamImports,
  listSteamLinks as validateListSteamLinks,
  mergeSteamDuplicates as validateMergeSteamDuplicates,
  steamAchievementBatchSync as validateSteamAchievementBatchSync,
  steamGameAchievementSync as validateSteamGameAchievementSync,
  steamSync as validateSteamSync,
  unlinkSteamGame as validateUnlinkSteamGame,
  updateSteamCandidate as validateUpdateSteamCandidate,
} from "../validators/steam.js";
import {
  createSteamOpenIdUrl,
  attachSteamCandidateToGame,
  autoMatchSteamCandidates,
  bulkUpdateSteamCandidates,
  disconnectSteamAccount,
  fetchPlayerSummary,
  frontendSteamUrl,
  getSteamAccountPayload,
  importSteamCandidates,
  importSteamCandidatesForScope,
  listBacklogDuplicateGroups,
  listSteamLinkCandidates,
  listSteamImportCandidates,
  mergeBacklogDuplicateGames,
  syncSteamAchievementsForGame,
  syncSteamAchievementsForLinkedGames,
  syncSteamLibrary,
  unlinkSteamAppFromGame,
  updateSteamImportCandidate,
  upsertSteamAccount,
  verifySteamOpenId,
  verifySteamState,
} from "../services/steamService.js";

const router = express.Router();

function isLocalRequest(req) {
  const host = String(req.hostname || "").toLowerCase();
  const ip = String(req.ip || "").replace(/^::ffff:/, "");
  return (
    ["localhost", "127.0.0.1", "::1"].includes(host) ||
    ["127.0.0.1", "::1"].includes(ip)
  );
}

router.get("/auth/start", verifyToken, (req, res, next) => {
  try {
    res.json({ url: createSteamOpenIdUrl(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get("/auth/callback", async (req, res) => {
  try {
    const userId = verifySteamState(req.query.state);
    const steamId = await verifySteamOpenId(req.query);
    const summary = await fetchPlayerSummary(steamId).catch(() => ({}));
    await upsertSteamAccount(userId, steamId, summary);
    res.redirect(frontendSteamUrl({ linked: "1" }));
  } catch (err) {
    res.redirect(
      frontendSteamUrl({
        error: err?.message || "Could not link Steam.",
      })
    );
  }
});

router.post("/dev-link", verifyToken, validateDevLinkSteam, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production" || !isLocalRequest(req)) {
      return next(notFound("Not found"));
    }
    const steamId = String(req.body?.steamId || "").trim();
    if (!/^\d{10,24}$/.test(steamId)) {
      return next(badRequest("steamId must be a SteamID64."));
    }
    const summary = req.body?.summary || {};
    const account = await upsertSteamAccount(req.user.id, steamId, {
      displayName: summary.displayName || `Steam ${steamId}`,
      profileUrl: summary.profileUrl || `https://steamcommunity.com/profiles/${steamId}`,
      avatarUrl: summary.avatarUrl || null,
      visibilityState: summary.visibilityState ?? null,
    });
    res.status(201).json({ account });
  } catch (err) {
    next(err);
  }
});

router.get("/account", verifyToken, async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getSteamAccountPayload(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.delete("/account", verifyToken, async (req, res, next) => {
  try {
    const payload = await disconnectSteamAccount(req.user.id);
    cacheClear(req.user.id);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post("/sync", verifyToken, validateSteamSync, async (req, res, next) => {
  try {
    const payload = await syncSteamLibrary(req.user.id, {
      force: process.env.NODE_ENV !== "production" && req.body?.force === true,
    });
    try {
      payload.achievements = await syncSteamAchievementsForLinkedGames(req.user.id, {
        force: process.env.NODE_ENV !== "production" && req.body?.force === true,
      });
    } catch (achievementErr) {
      payload.achievements = {
        failed: true,
        errorCode: achievementErr?.code || "steam_achievements_sync_failed",
        errorMessage:
          achievementErr?.message || "Could not sync Steam achievements.",
      };
    }
    cacheClear(req.user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/achievements/sync",
  verifyToken,
  validateSteamAchievementBatchSync,
  async (req, res, next) => {
  try {
    const payload = await syncSteamAchievementsForLinkedGames(req.user.id, {
      force: process.env.NODE_ENV !== "production" && req.body?.force === true,
      limit: req.body?.limit,
    });
    cacheClear(req.user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    next(err);
  }
  }
);

router.post(
  "/games/:gameId/achievements/sync",
  verifyToken,
  validateSteamGameAchievementSync,
  async (req, res, next) => {
  try {
    const payload = await syncSteamAchievementsForGame(req.user.id, req.params.gameId, {
      force: process.env.NODE_ENV !== "production" && req.body?.force === true,
    });
    cacheClear(req.user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    next(err);
  }
  }
);

router.get("/import-candidates", verifyToken, validateListSteamImports, async (req, res, next) => {
  try {
    const status = String(req.query.status || "active");
    const group = String(req.query.group || "all");
    const achievement = String(req.query.achievement || "all");
    const sort = String(req.query.sort || "name");
    const query = String(req.query.q || "");
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);
    const payload = await listSteamImportCandidates(req.user.id, {
      status,
      group,
      achievement,
      sort,
      query,
      limit,
      offset,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/import-candidates/:id",
  verifyToken,
  validateUpdateSteamCandidate,
  async (req, res, next) => {
  try {
    const candidate = await updateSteamImportCandidate(
      req.user.id,
      req.params.id,
      String(req.body?.action || ""),
      req.body || {}
    );
    if (!candidate) return next(notFound("Steam import candidate not found."));
    res.json(candidate);
  } catch (err) {
    next(err);
  }
  }
);

router.post(
  "/import-candidates/bulk",
  verifyToken,
  validateBulkSteamCandidates,
  async (req, res, next) => {
  try {
    const payload = await bulkUpdateSteamCandidates(req.user.id, req.body || {});
    res.json(payload);
  } catch (err) {
    next(err);
  }
  }
);

router.post(
  "/import-candidates/auto-match",
  verifyToken,
  validateAutoMatchSteam,
  async (req, res, next) => {
  try {
    const payload = await autoMatchSteamCandidates(req.user, {
      limit: req.body?.limit,
    });
    res.json(payload);
  } catch (err) {
    next(err);
  }
  }
);

router.get("/link-candidates", verifyToken, validateListSteamLinks, async (req, res, next) => {
  try {
    const payload = await listSteamLinkCandidates(req.user.id, {
      query: req.query.q,
      gameId: req.query.gameId,
      limit: req.query.limit,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get("/duplicate-games", verifyToken, async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await listBacklogDuplicateGroups(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/duplicate-games/merge",
  verifyToken,
  validateMergeSteamDuplicates,
  async (req, res, next) => {
  try {
    const payload = await mergeBacklogDuplicateGames(
      req.user.id,
      req.body?.keepGameId,
      req.body?.duplicateGameIds || []
    );
    cacheClear(req.user.id);
    res.json(payload);
  } catch (err) {
    next(err);
  }
  }
);

router.post(
  "/link-candidates/:id/attach",
  verifyToken,
  validateAttachSteamCandidate,
  async (req, res, next) => {
  try {
    const payload = await attachSteamCandidateToGame(
      req.user.id,
      req.params.id,
      req.body?.gameId
    );
    if (!payload) return next(notFound("Steam link candidate not found."));
    cacheClear(req.user.id);
    res.json(payload);
  } catch (err) {
    next(err);
  }
  }
);

router.delete(
  "/games/:gameId/link/:steamAppId",
  verifyToken,
  validateUnlinkSteamGame,
  async (req, res, next) => {
  try {
    const payload = await unlinkSteamAppFromGame(
      req.user.id,
      req.params.gameId,
      req.params.steamAppId
    );
    if (!payload) return next(notFound("Steam game link not found."));
    cacheClear(req.user.id);
    res.json(payload);
  } catch (err) {
    next(err);
  }
  }
);

router.post("/import", verifyToken, validateImportSteam, async (req, res, next) => {
  try {
    const payload = req.body?.scope
      ? await importSteamCandidatesForScope(req.user.id, req.body.scope)
      : await importSteamCandidates(req.user.id, req.body?.candidateIds || []);
    cacheClear(req.user.id);
    res.status(201).json(payload);
  } catch (err) {
    next(err);
  }
});

export default router;
