import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

import express from "express";
import { registerSecurity } from "./middleware/security.js";
import { authLimiter, publicLimiter } from "./middleware/rateLimit.js";
import gamesRouter, { initCache } from "./routes/games.js";
import authRouter from "./routes/auth.js";
import publicRouter from "./routes/public.js";
import insightsRouter from "./routes/insights.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { errors } from "celebrate";
const app = express();

registerSecurity(app);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
await initCache(app); // sets app.locals.rawgCache

// ---- Routes ----
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/public", publicLimiter, publicRouter);
app.use("/api/games", gamesRouter);
app.use("/api/insights", insightsRouter);
app.use(errors());
app.use(errorHandler);

// ---- Server ----
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
