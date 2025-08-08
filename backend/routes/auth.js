import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/**
 * POST /api/auth/register
 * Creates a new user
 */
router.post("/register", async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      const err = new Error("Username and password are required");
      err.statusCode = 400;
      return next(err);
    }

    // Check if username already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (existingUser.rows.length > 0) {
      const err = new Error("Username already taken");
      err.statusCode = 400;
      return next(err);
    }

    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const result = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
      [username, passwordHash]
    );

    const user = result.rows[0];

    // Create JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user and returns a JWT
 */
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      const err = new Error("Username and password are required");
      err.statusCode = 400;
      return next(err);
    }

    // Find user
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    if (result.rows.length === 0) {
      const err = new Error("Invalid username or password");
      err.statusCode = 401;
      return next(err);
    }

    const user = result.rows[0];

    // Check password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const err = new Error("Invalid username or password");
      err.statusCode = 401;
      return next(err);
    }

    // Create JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user's info
 */
router.get("/me", verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, username FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      const err = new Error("User not found");
      err.statusCode = 404;
      return next(err);
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
