import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import { verifyToken } from "../middleware/auth.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { notificationLabEnabled } from "../config/notificationLab.js";
import {
  notificationLabScenarios,
  resetNotificationLab,
  seedNotificationLab,
} from "../services/notificationLabService.js";

const router = express.Router();
const validationOptions = { convert: true, abortEarly: false, stripUnknown: true };

function isLocalRequest(req) {
  const host = String(req.hostname || "").toLowerCase();
  const ip = String(req.ip || "").replace(/^::ffff:/, "");
  return ["localhost", "127.0.0.1", "::1"].includes(host)
    || ["127.0.0.1", "::1"].includes(ip);
}

function localLabOnly(req, _res, next) {
  if (!notificationLabEnabled() || !isLocalRequest(req)) {
    return next(notFound("Not found"));
  }
  if (req.user?.is_guest) {
    return next(badRequest("Notification Lab needs a local signed-in account, not a demo session."));
  }
  return next();
}

router.post(
  "/seed",
  verifyToken,
  localLabOnly,
  celebrate({
    [Segments.BODY]: Joi.object({
      scenario: Joi.string().valid(...notificationLabScenarios).default("all"),
    }),
  }, validationOptions),
  async (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await seedNotificationLab(req.user.id, req.body.scenario));
    } catch (error) {
      next(error);
    }
  },
);

router.post("/reset", verifyToken, localLabOnly, async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await resetNotificationLab(req.user.id));
  } catch (error) {
    next(error);
  }
});

export default router;
