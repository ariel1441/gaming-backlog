// backend/index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { registerSecurity } from "./middleware/security.js";
import { authLimiter, publicLimiter } from "./middleware/rateLimit.js";
import gamesRouter, { initCache } from "./routes/games.js";
import authRouter from "./routes/auth.js";
import publicRouter from "./routes/public.js";
import insightsRouter from "./routes/insights.js";
import metaRouter from "./routes/meta.js";
import catalogRouter from "./routes/catalog.js";
import steamRouter from "./routes/steam.js";
import listsRouter from "./routes/lists.js";
import metadataRouter from "./routes/metadata.js";
import { startCatalogCollectionScheduler } from "./services/catalogService.js";
import { startMetadataRepairScheduler } from "./services/metadataRepairService.js";
import { startSteamSyncJobScheduler } from "./services/steamService.js";
import errorHandler from "./middleware/errorHandler.js";
import demoRouter from "./routes/demo.js";
import { pool } from "./db.js";

const app = express();

registerSecurity(app);

await initCache(app); // sets app.locals.rawgCache
const stopCatalogCollectionScheduler = startCatalogCollectionScheduler();
const stopSteamSyncJobScheduler = startSteamSyncJobScheduler();
const stopMetadataRepairScheduler = startMetadataRepairScheduler();

// Liveness probe for platform health checks
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// ---- Routes ----
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/public", publicLimiter, publicRouter);
app.use("/api/catalog", publicLimiter, catalogRouter);
app.use("/api/steam", publicLimiter, steamRouter);
app.use("/api/lists", listsRouter);
app.use("/api/games", gamesRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/meta", metaRouter);
app.use("/api/metadata", metadataRouter);
app.use("/api/demo", publicLimiter, demoRouter);

// 404 for any unmatched route (forward to error handler)
app.use((req, _res, next) => {
  const err = new Error("Not found");
  err.status = 404;
  next(err);
});

// Celebrate/Joi validation errors → JSON

// Central error handler (consistent { error: { code, message, requestId } })
app.use(errorHandler);

// ---- Server ----
const PORT = process.env.PORT || 5000;
const isDevelopment = process.env.NODE_ENV === "development";
const PORT_RETRY_LIMIT = isDevelopment ? 60 : 0;
const PORT_RETRY_DELAY_MS = 500;
const server = app.listen(PORT);
let portRetryCount = 0;

let shuttingDown = false;
let guestCleanupInterval = null;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  stopCatalogCollectionScheduler?.();
  stopSteamSyncJobScheduler?.();
  stopMetadataRepairScheduler?.();

  if (guestCleanupInterval) {
    clearInterval(guestCleanupInterval);
    guestCleanupInterval = null;
  }

  if (isDevelopment) {
    server.closeAllConnections?.();
  }

  const forceExitTimer = setTimeout(() => {
    server.closeAllConnections?.();
    process.exit(exitCode);
  }, isDevelopment ? 750 : 3000);
  forceExitTimer.unref?.();

  server.closeIdleConnections?.();
  server.close(async () => {
    clearTimeout(forceExitTimer);
    try {
      await pool.end();
    } catch (error) {
      console.error("Database pool shutdown failed:", error?.message || error);
    }
    process.exit(exitCode);
  });
}

server.on("listening", () => {
  portRetryCount = 0;
  if (process.env.NODE_ENV !== "test") {
    console.log(`Server running on port ${PORT}`);
  }
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    if (portRetryCount < PORT_RETRY_LIMIT) {
      portRetryCount += 1;
      const shouldLog =
        portRetryCount === 1 ||
        portRetryCount === PORT_RETRY_LIMIT ||
        portRetryCount % 5 === 0;
      if (shouldLog) {
        console.warn(
          `Port ${PORT} is still busy; retrying backend start ` +
            `(${portRetryCount}/${PORT_RETRY_LIMIT})...`
        );
      }
      setTimeout(() => {
        server.listen(PORT);
      }, PORT_RETRY_DELAY_MS).unref?.();
      return;
    }
    console.error(
      `Port ${PORT} is already in use. Stop the other backend process or run npm run dev:ports:back.`
    );
    process.exit(1);
  }
  throw error;
});

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.once(sig, () => {
    void shutdown(0);
  });
}

const DEMO_ENABLED = String(process.env.DEMO_ENABLED ?? "true") === "true";
if (DEMO_ENABLED) {
  guestCleanupInterval = setInterval(
    async () => {
      try {
        await pool.query(`
        DELETE FROM users
         WHERE is_guest = TRUE
           AND guest_expires_at IS NOT NULL
           AND guest_expires_at < NOW()
      `);
      } catch (e) {
        console.error("Guest cleanup failed:", e?.message || e);
      }
    },
    60 * 60 * 1000
  );
}
