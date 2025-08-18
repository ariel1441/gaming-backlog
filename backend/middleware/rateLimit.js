// backend/middleware/rateLimit.js
import rateLimit from "express-rate-limit";

function createLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Don't rate-limit preflight
    skip: (req) => req.method === "OPTIONS",
    handler: (req, res) => {
      const requestId = req.requestId || null;
      res.status(429).json({
        error: {
          code: "rate_limited",
          message,
          requestId,
        },
      });
    },
  });
}

export const authLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: "Too many auth attempts. Please try again later.",
});

export const publicLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: "Too many requests, please try again later.",
});
