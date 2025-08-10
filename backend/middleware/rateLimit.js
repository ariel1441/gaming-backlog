// backend/middleware/rateLimit.js
import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 req/min/IP on /api/auth/*
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Please try again shortly." },
});
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 req/min/IP on /api/public/*
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again shortly." },
});
