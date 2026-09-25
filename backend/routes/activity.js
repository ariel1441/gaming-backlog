import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { notFound } from "../utils/httpError.js";
import {
  listActivityEvents,
  updateActivityEvent,
} from "../services/activityEventService.js";
import {
  listActivity, listActivityInsights, listPlayHistory, resetActivityAllocation,
  saveActivityAllocation, updateActivity,
} from "../validators/activity.js";
import { listInbox, updateInbox, hideOtherInbox } from '../validators/activity.js';
import { activateActivityInbox, listActivityInbox, updateActivityInbox, hideOtherActivityUpdates, clearActivityUpdates } from '../services/activityInboxService.js';
import {
  listSteamActivityHistory, listSteamActivityInsights, resetSteamActivityAllocation,
  saveSteamActivityAllocation,
} from "../services/steamActivityService.js";
import { forbidden } from "../utils/httpError.js";

const router = express.Router();
router.post('/inbox/hide-other', verifyToken, hideOtherInbox, async (req, res, next) => {
  try { res.json(await hideOtherActivityUpdates(req.user.id, req.body.snapshot)); }
  catch (error) { next(error); }
});
router.post('/inbox/clear-updates', verifyToken, hideOtherInbox, async (req, res, next) => {
  try { res.json(await clearActivityUpdates(req.user.id, req.body.snapshot)); }
  catch (error) { next(error); }
});

router.get('/inbox', verifyToken, listInbox, async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await listActivityInbox(req.user.id, req.query)); }
  catch (error) { next(error); }
});
router.post('/inbox/activate', verifyToken, async (req, res, next) => {
  try { res.json(await activateActivityInbox(req.user.id)); } catch (error) { next(error); }
});

router.get('/play-history', verifyToken, listPlayHistory, async (req, res, next) => {
  try {
    if (req.user?.is_guest) {
      throw forbidden("Gaming activity is unavailable in demo sessions.");
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(await listSteamActivityHistory(req.user.id, req.query));
  } catch (error) {
    next(error);
  }
});
router.get('/insights', verifyToken, listActivityInsights, async (req, res, next) => {
  try {
    if (req.user?.is_guest) {
      throw forbidden("Gaming activity is unavailable in demo sessions.");
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(await listSteamActivityInsights(req.user.id, req.query));
  } catch (error) {
    next(error);
  }
});
router.put('/play-history/:observationId/allocation', verifyToken, saveActivityAllocation, async (req, res, next) => {
  try {
    if (req.user?.is_guest) throw forbidden("Gaming activity is unavailable in demo sessions.");
    res.json(await saveSteamActivityAllocation(
      req.user.id,
      req.params.observationId,
      req.body.allocations,
      req.body.expectedRevision,
    ));
  } catch (error) {
    next(error);
  }
});
router.delete('/play-history/:observationId/allocation', verifyToken, resetActivityAllocation, async (req, res, next) => {
  try {
    if (req.user?.is_guest) throw forbidden("Gaming activity is unavailable in demo sessions.");
    res.json(await resetSteamActivityAllocation(
      req.user.id,
      req.params.observationId,
      req.query.expectedRevision,
    ));
  } catch (error) {
    next(error);
  }
});
router.patch('/inbox', verifyToken, updateInbox, async (req, res, next) => {
  try { res.json(await updateActivityInbox(req.user.id, req.body.eventIds, req.body.action)); }
  catch (error) { next(error); }
});

router.get("/", verifyToken, listActivity, async (req, res, next) => {
  try {
    const payload = await listActivityEvents(req.user.id, req.query);
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", verifyToken, updateActivity, async (req, res, next) => {
  try {
    const event = await updateActivityEvent(
      req.user.id,
      req.params.id,
      req.body.action,
    );
    if (!event) return next(notFound("Activity event not found."));
    res.setHeader("Cache-Control", "no-store");
    return res.json({ event });
  } catch (error) {
    return next(error);
  }
});

export default router;
