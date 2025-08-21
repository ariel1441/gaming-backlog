// backend/index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { registerSecurity } from "./middleware/security.js";
import { authLimiter, publicLimiter } from "./middleware/rateLimit.js";
import gamesRouter, { initCache } from "./routes/games.js";
import authRouter from "./routes/auth.js";
import publicRouter from "./routes/public.js";
import insightsRouter from "./routes/insights.js";
import metaRouter from "./routes/meta.js";
import errorHandler from "./middleware/errorHandler.js";
import { errors as celebrateErrors } from "celebrate";
import corsOptions from "./config/cors.js";

const app = express();

registerSecurity(app);

app.use(cors(corsOptions));

await initCache(app); // sets app.locals.rawgCache

// Liveness probe for platform health checks
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// ---- Routes ----
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/public", publicLimiter, publicRouter);
app.use("/api/games", gamesRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/meta", metaRouter);

// 404 for any unmatched route (forward to error handler)
app.use((req, _res, next) => {
  const err = new Error("Not found");
  err.status = 404;
  next(err);
});

// Celebrate/Joi validation errors → JSON
app.use(celebrateErrors());

// Central error handler (consistent { error: { code, message, requestId } })
app.use(errorHandler);

// ---- Server ----
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  if (process.env.NODE_ENV !== "test") {
    console.log(`Server running on port ${PORT}`);
  }
});

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
