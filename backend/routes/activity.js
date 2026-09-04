import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { notFound } from "../utils/httpError.js";
import {
  listActivityEvents,
  updateActivityEvent,
} from "../services/activityEventService.js";
import { listActivity, updateActivity } from "../validators/activity.js";

const router = express.Router();

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
