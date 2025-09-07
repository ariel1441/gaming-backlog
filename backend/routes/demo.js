import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

const DEMO_ENABLED = String(process.env.DEMO_ENABLED ?? "true") === "true";
const DEMO_TEMPLATE_USERNAME =
  process.env.DEMO_TEMPLATE_USERNAME || "demo_template";
const GUEST_TTL_HOURS = Number(process.env.DEMO_GUEST_TTL_HOURS || 36);
const { JWT_SECRET } = process.env;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

// simple helpers
const USERNAME_RE = /^[\w.-]{3,30}$/;
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
  // Add more INSERT…SELECT blocks here if you later add child tables
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

router.post("/start", async (req, res) => {
  if (!DEMO_ENABLED)
    return res.status(503).json({ error: "Demo is temporarily disabled" });

  // ── idempotent guard: if already a guest with a valid token, reuse it ──
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
          // do not re-clone; just extend TTL if you want
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
    // ignore and fall through to create a fresh guest
  }

  // ── create new guest + clone template once ──
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const templateId = await getTemplateUserId();
    if (!templateId) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "Demo template user not found" });
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

    res.status(201).json({
      token,
      user: {
        id: guest.id,
        username: guest.username,
        is_public: guest.is_public,
        is_guest: true,
        guest_expires_at: guest.guest_expires_at,
      },
    });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error(e);
    res.status(500).json({ error: "Failed to start demo session" });
  } finally {
    client.release();
  }
});

router.post("/keep", verifyToken, async (req, res) => {
  const { id, is_guest } = req.user || {};
  if (!id || !is_guest)
    return res
      .status(400)
      .json({ error: "Only a guest can keep their sandbox" });

  const { username, password } = req.body || {};
  if (!USERNAME_RE.test(username || ""))
    return res.status(400).json({ error: "Invalid username" });
  if (typeof password !== "string" || password.length < 6)
    return res.status(400).json({ error: "Password too short" });

  const exists = await pool.query(`SELECT 1 FROM users WHERE username = $1`, [
    username,
  ]);
  if (exists.rowCount > 0)
    return res.status(409).json({ error: "username already taken" });

  const hash = await bcrypt.hash(password, 10);
  const upd = await pool.query(
    `UPDATE users
       SET username = $1, password_hash = $2, is_guest = false, guest_expires_at = NULL
     WHERE id = $3 AND is_guest = true
     RETURNING id, username, is_public`,
    [username, hash, id]
  );
  const user = upd.rows[0];
  if (!user) return res.status(400).json({ error: "Not a guest user" });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
  res.json({ token, user });
});

router.post("/discard", verifyToken, async (req, res) => {
  const { id, is_guest } = req.user || {};
  if (!id || !is_guest)
    return res.status(400).json({ error: "Not a guest session" });

  await pool.query(`DELETE FROM users WHERE id = $1 AND is_guest = true`, [id]);
  res.json({ ok: true });
});

// Extend guest TTL while user is active
router.post("/heartbeat", verifyToken, async (req, res) => {
  const { id, is_guest } = req.user || {};
  if (!id || !is_guest) return res.status(204).end();
  const expiresAt = new Date(Date.now() + GUEST_TTL_HOURS * 3600 * 1000);
  await pool.query(
    `UPDATE users SET guest_expires_at = $2 WHERE id = $1 AND is_guest = TRUE`,
    [id, expiresAt]
  );
  return res.status(204).end();
});

export default router;
