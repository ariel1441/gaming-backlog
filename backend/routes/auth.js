// backend/routes/auth.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/register
 * Body: { username, password }
 * Creates a user and returns { token, user }
 */
router.post("/register", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "username and password are required" });
    }

    // basic username guard
    if (!/^[\w.-]{3,30}$/.test(username)) {
      return res.status(400).json({ error: "invalid username format" });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "username already taken" });
    }

    const hash = await bcrypt.hash(password, 10);
    const insert = await pool.query(
      `INSERT INTO users (username, password_hash, is_public)
       VALUES ($1, $2, false)
       RETURNING id, username, is_public`,
      [username, hash]
    );

    const user = insert.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns { token, user }
 */
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "username and password are required" });
    }

    const result = await pool.query(
      "SELECT id, username, password_hash, is_public FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // Return without password hash
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        is_public: user.is_public,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Returns authenticated user's profile
 */
router.get("/me", verifyToken, async (req, res, next) => {
  try {
    const me = await pool.query(
      "SELECT id, username, is_public, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (me.rows.length === 0) {
      return res.status(404).json({ error: "user not found" });
    }
    res.json(me.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/auth/me/is-public
 * Body: { is_public: boolean }
 * Toggle public mode for the authenticated user
 */
router.patch("/me/is-public", verifyToken, async (req, res, next) => {
  try {
    const { is_public } = req.body || {};
    if (typeof is_public !== "boolean") {
      return res.status(400).json({ error: "is_public must be boolean" });
    }

    const updated = await pool.query(
      "UPDATE users SET is_public = $1 WHERE id = $2 RETURNING id, username, is_public",
      [is_public, req.user.id]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
