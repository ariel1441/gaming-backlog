import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { notFound } from "../utils/httpError.js";
import {
  listActivityEvents,
  updateActivityEvent,
} from "../services/activityEventService.js";
import { listActivity, listPlayHistory, updateActivity } from "../validators/activity.js";
import { listInbox, updateInbox, hideOtherInbox } from '../validators/activity.js';
import { activateActivityInbox, listActivityInbox, updateActivityInbox, hideOtherActivityUpdates } from '../services/activityInboxService.js';
import { listSteamActivityHistory } from "../services/steamActivityService.js";

const router = express.Router();
router.post('/inbox/hide-other', verifyToken, hideOtherInbox, async (req, res, next) => {
  try { res.json(await hideOtherActivityUpdates(req.user.id, req.body.snapshot)); }
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
    res.setHeader('Cache-Control', 'no-store');
    res.json(await listSteamActivityHistory(req.user.id, req.query));
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
