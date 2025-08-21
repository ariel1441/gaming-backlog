// backend/middleware/security.js
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import express from "express";
import corsOptions from "../config/cors.js";

/**
 * Registers core, app-wide middleware in a single place.
 * Order matters: helmet -> cors -> parsers -> compression.
 */
export function registerSecurity(app) {
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // Allow cross-origin loading of images/fonts if you serve public assets
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // CORS (single source of truth) + explicit, fast preflights
  const corsHandler = cors(corsOptions);
  app.use(corsHandler);
  app.options("*", corsHandler);

  // Body parsers live here (single source of truth)
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  // Response compression
  app.use(compression());
}
