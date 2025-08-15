// backend/routes/meta.js
import express from "express";
import crypto from "node:crypto";
import { GROUP_DEFS, BUCKETS } from "../utils/status.js";

const router = express.Router();

/**
 * GET /api/meta/status-groups
 * Returns { groups: GROUP_DEFS, buckets: BUCKETS }
 * Uses an ETag so subsequent requests return 304 Not Modified.
 */
router.get("/status-groups", (req, res) => {
  const payload = { groups: GROUP_DEFS, buckets: BUCKETS };
  const body = JSON.stringify(payload);

  // Stable short ETag derived from content; changes only when defs change.
  const etag = `"sg-${crypto.createHash("sha256").update(body).digest("hex").slice(0, 16)}"`;

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400"); // cache for 24h
  res.setHeader("ETag", etag);
  res.send(body);
});

export default router;
