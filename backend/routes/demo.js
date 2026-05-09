import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { keepDemo as validateKeepDemo } from "../validators/demo.js";
import {
  badRequest,
  conflict,
  httpError,
  serviceUnavailable,
} from "../utils/httpError.js";

const router = express.Router();

const DEMO_ENABLED = String(process.env.DEMO_ENABLED ?? "true") === "true";
const DEMO_TEMPLATE_USERNAME =
  process.env.DEMO_TEMPLATE_USERNAME || "demo_template";
const GUEST_TTL_HOURS = Number(process.env.DEMO_GUEST_TTL_HOURS || 36);
const { JWT_SECRET } = process.env;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

const randomId = (n = 10) =>
  Math.random()
    .toString(36)
    .slice(2, 2 + n);

const newGuestCreds = () => ({
  user: `guest_${Date.now().toString(36)}_${randomId(4)}`,
  pass: `g!${randomId(12)}$${Date.now().toString(36)}`,
});

async function getTemplateUserId() {
  const r = await pool.query(`SELECT id FROM users WHERE username = $1`, [
    DEMO_TEMPLATE_USERNAME,
  ]);
  return r.rows[0]?.id || null;
}

async function cloneTemplateGames(client, templateUserId, toUserId) {
  // Add more INSERT...SELECT blocks here if you later add child tables.
  await client.query(
    `
    INSERT INTO games (
      user_id, name, status, position, my_genre, how_long_to_beat,
      my_score, thoughts, started_at, finished_at
    )
    SELECT
      $1, name, status, position, my_genre, how_long_to_beat,
      my_score, thoughts, started_at, finished_at
    FROM games
    WHERE user_id = $2
  `,
    [toUserId, templateUserId]
  );
}

router.post("/start", async (req, res, next) => {
  if (!DEMO_ENABLED) {
    return next(serviceUnavailable("Demo is temporarily disabled"));
  }

  // Idempotent guard: if already a guest with a valid token, reuse it.
  try {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      const token = auth.slice("Bearer ".length);
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload?.is_guest && payload?.id) {
        const r = await pool.query(
          `SELECT id, username, is_public, is_guest, guest_expires_at
             FROM users
            WHERE id = $1 AND is_guest = TRUE`,
          [payload.id]
        );
        if (r.rows.length) {
          const expiresAt = new Date(
            Date.now() + GUEST_TTL_HOURS * 3600 * 1000
          );
          await pool.query(
            `UPDATE users SET guest_expires_at = $2 WHERE id = $1 AND is_guest = TRUE`,
            [payload.id, expiresAt]
          );
          return res.status(200).json({ token, user: r.rows[0] });
        }
      }
    }
  } catch {
    // Ignore invalid tokens and fall through to create a fresh guest.
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const templateId = await getTemplateUserId();
    if (!templateId) {
      await client.query("ROLLBACK");
      return next(httpError(500, "Demo template user not found"));
    }

    const expiresAt = new Date(Date.now() + GUEST_TTL_HOURS * 3600 * 1000);
    const { user: username, pass: password } = newGuestCreds();
    const hash = await bcrypt.hash(password, 10);

    const ins = await client.query(
      `INSERT INTO users (username, password_hash, is_public, is_guest, guest_expires_at)
       VALUES ($1, $2, false, true, $3)
       RETURNING id, username, is_public, is_guest, guest_expires_at`,
      [username, hash, expiresAt]
    );
    const guest = ins.rows[0];

    await cloneTemplateGames(client, templateId, guest.id);
    await client.query("COMMIT");

    const token = jwt.sign(
      { id: guest.id, username: guest.username, is_guest: true },
      JWT_SECRET,
      { expiresIn: `${GUEST_TTL_HOURS}h` }
    );

    return res.status(201).json({
      token,
      user: {
        id: guest.id,
        username: guest.username,
        is_public: guest.is_public,
        is_guest: true,
        guest_expires_at: guest.guest_expires_at,
      },
    });
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return next(httpError(500, "Failed to start demo session"));
  } finally {
    client.release();
  }
});

router.post("/keep", verifyToken, validateKeepDemo, async (req, res, next) => {
  try {
    const { id, is_guest } = req.user || {};
    if (!id || !is_guest) {
      return next(badRequest("Only a guest can keep their sandbox"));
    }

    const { username, password } = req.body || {};
    const exists = await pool.query(`SELECT 1 FROM users WHERE username = $1`, [
      username,
    ]);
    if (exists.rowCount > 0) {
      return next(conflict("username already taken"));
    }

    const hash = await bcrypt.hash(password, 10);
    const upd = await pool.query(
      `UPDATE users
         SET username = $1, password_hash = $2, is_guest = false, guest_expires_at = NULL
       WHERE id = $3 AND is_guest = true
       RETURNING id, username, is_public`,
      [username, hash, id]
    );
    const user = upd.rows[0];
    if (!user) return next(badRequest("Not a guest user"));

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    return res.json({ token, user });
  } catch (err) {
    return next(err);
  }
});

router.post("/discard", verifyToken, async (req, res, next) => {
  try {
    const { id, is_guest } = req.user || {};
    if (!id || !is_guest) return next(badRequest("Not a guest session"));

    await pool.query(`DELETE FROM users WHERE id = $1 AND is_guest = true`, [
      id,
    ]);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post("/heartbeat", verifyToken, async (req, res, next) => {
  try {
    const { id, is_guest } = req.user || {};
    if (!id || !is_guest) return res.status(204).end();

    const expiresAt = new Date(Date.now() + GUEST_TTL_HOURS * 3600 * 1000);
    await pool.query(
      `UPDATE users SET guest_expires_at = $2 WHERE id = $1 AND is_guest = TRUE`,
      [id, expiresAt]
    );
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

export default router;
