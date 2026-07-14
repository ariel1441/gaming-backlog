import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { badRequest } from "../utils/httpError.js";
import { cacheClear } from "../utils/microCache.js";
import {
  decideMetadataCandidate as validateDecision,
  listMetadataCandidates as validateCandidateList,
  selectGameMetadata as validateSelection,
} from "../validators/metadata.js";
import {
  acceptRawgMetadataSelection,
  decideMetadataCandidate,
  enqueueMetadataRepair,
  getLatestMetadataRepair,
  listMetadataCandidates,
} from "../services/metadataRepairService.js";

const router = express.Router();

function rejectGuest(req) {
  if (req.user?.is_guest) {
    throw badRequest("Metadata repair is unavailable in demo sessions.");
  }
}

router.post("/repair-jobs", verifyToken, async (req, res, next) => {
  try {
    rejectGuest(req);
    const job = await enqueueMetadataRepair(req.user.id);
    res.status(202).json({ job });
  } catch (error) {
    next(error);
  }
});

router.get("/repair-jobs/latest", verifyToken, async (req, res, next) => {
  try {
    rejectGuest(req);
    res.setHeader("Cache-Control", "no-store");
    res.json(await getLatestMetadataRepair(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.get(
  "/candidates",
  verifyToken,
  validateCandidateList,
  async (req, res, next) => {
    try {
      rejectGuest(req);
      const candidates = await listMetadataCandidates(req.user.id, req.query);
      res.setHeader("Cache-Control", "no-store");
      res.json({ candidates });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/candidates/:id",
  verifyToken,
  validateDecision,
  async (req, res, next) => {
    try {
      rejectGuest(req);
      const result = await decideMetadataCandidate(
          req.user.id,
          Number(req.params.id),
          req.body.action,
        );
      if (req.body.action === "accept") cacheClear(req.user.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/games/:gameId/select",
  verifyToken,
  validateSelection,
  async (req, res, next) => {
    try {
      rejectGuest(req);
      const result = await acceptRawgMetadataSelection(
          req.user.id,
          Number(req.params.gameId),
          req.body.rawg_id,
        );
      cacheClear(req.user.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
