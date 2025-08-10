// backend/middleware/security.js
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import express from "express";
import corsOptions from "../config/cors.js";

/**
 * Registers core, app-wide middleware in a single place.
 * Keep this small and deterministic (order matters).
 */
export function registerSecurity(app) {
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // Allow cross-origin loading of images/fonts if you serve public assets
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // CORS (locked to your frontend origin via config/cors.js)
  app.use(cors(corsOptions));

  app.use(express.json({ limit: "1mb" }));
  app.use(compression());
}
