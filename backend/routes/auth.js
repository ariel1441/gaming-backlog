// backend/routes/auth.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { pool } from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { passwordPolicyError } from "../utils/passwordPolicy.js";
import {
  badRequest,
  conflict,
  notFound,
  unauthorized,
} from "../utils/httpError.js";

const router = express.Router();
const { JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET");
}

const DEFAULT_PREFERENCES = {
  default_backlog_view: "grid",
  default_backlog_sort_key: "",
  default_backlog_sort_reversed: false,
  default_landing_path: "/",
};
const ALLOWED_BACKLOG_VIEWS = new Set(["grid", "compact", "list"]);
const ALLOWED_BACKLOG_SORT_KEYS = new Set([
  "",
  "name",
  "hoursPlayed",
  "rawgRating",
  "metacritic",
  "releaseDate",
  "startedDate",
  "finishedDate",
  "steamLastPlayed",
]);
const ALLOWED_LANDING_PATHS = new Set([
  "/",
  "/me",
  "/timeline",
  "/discover",
  "/insights",
]);
const DEFAULT_PROFILE = {
  display_name: "",
  bio: "",
  avatar_icon: "gamepad",
  avatar_color: "orange",
};
const ALLOWED_AVATAR_ICONS = new Set([
  "gamepad",
  "joystick",
  "dice",
  "trophy",
  "crown",
  "flame",
  "star",
  "skull",
  "sword",
  "shield",
  "book",
  "rocket",
  "heart",
  "zap",
  "compass",
  "potion",
  "hourglass",
  "headphones",
  "rune",
  "mask",
  "cards",
  "axe",
  "crystal",
  "leaf",
  "flower",
  "coffee",
  "cpu",
  "eye",
]);
const ALLOWED_AVATAR_COLORS = new Set([
  "orange",
  "blue",
  "green",
  "pink",
  "violet",
  "gold",
  "slate",
  "red",
]);

function serializePreferences(row = {}) {
  const source = row || {};
  return {
    default_backlog_view:
      source.default_backlog_view || DEFAULT_PREFERENCES.default_backlog_view,
    default_backlog_sort_key:
      source.default_backlog_sort_key ??
      DEFAULT_PREFERENCES.default_backlog_sort_key,
    default_backlog_sort_reversed:
      typeof source.default_backlog_sort_reversed === "boolean"
        ? source.default_backlog_sort_reversed
        : DEFAULT_PREFERENCES.default_backlog_sort_reversed,
    default_landing_path:
      source.default_landing_path || DEFAULT_PREFERENCES.default_landing_path,
  };
}

function serializeUser(row = {}) {
  return {
    id: row.id,
    username: row.username,
    is_public: row.is_public,
    display_name: row.display_name || "",
    bio: row.bio || "",
    avatar_icon: row.avatar_icon || DEFAULT_PROFILE.avatar_icon,
    avatar_color: row.avatar_color || DEFAULT_PROFILE.avatar_color,
    ...(row.is_guest != null ? { is_guest: row.is_guest } : {}),
    ...(row.guest_expires_at != null
      ? { guest_expires_at: row.guest_expires_at }
      : {}),
    ...(row.created_at != null ? { created_at: row.created_at } : {}),
    preferences: serializePreferences(row),
  };
}

function normalizeProfileInput(body = {}, current = DEFAULT_PROFILE) {
  const allowedKeys = new Set(Object.keys(DEFAULT_PROFILE));
  for (const key of Object.keys(body || {})) {
    if (!allowedKeys.has(key)) {
      throw badRequest(`Unknown profile field: ${key}`);
    }
  }

  const next = {
    ...DEFAULT_PROFILE,
    ...current,
    ...body,
  };
  const displayName =
    typeof next.display_name === "string" ? next.display_name.trim() : "";
  const bio = typeof next.bio === "string" ? next.bio.trim() : "";
  const avatarIcon = next.avatar_icon || DEFAULT_PROFILE.avatar_icon;
  const avatarColor = next.avatar_color || DEFAULT_PROFILE.avatar_color;

  if (displayName.length > 40) {
    throw badRequest("display_name must be 40 characters or less");
  }
  if (bio.length > 240) {
    throw badRequest("bio must be 240 characters or less");
  }
  if (!ALLOWED_AVATAR_ICONS.has(avatarIcon)) {
    throw badRequest("avatar_icon is invalid");
  }
  if (!ALLOWED_AVATAR_COLORS.has(avatarColor)) {
    throw badRequest("avatar_color is invalid");
  }

  return {
    display_name: displayName || null,
    bio: bio || null,
    avatar_icon: avatarIcon,
    avatar_color: avatarColor,
  };
}

function normalizePreferencesInput(body = {}, current = DEFAULT_PREFERENCES) {
  const allowedKeys = new Set(Object.keys(DEFAULT_PREFERENCES));
  for (const key of Object.keys(body || {})) {
    if (!allowedKeys.has(key)) {
      throw badRequest(`Unknown preference field: ${key}`);
    }
  }

  const next = {
    ...DEFAULT_PREFERENCES,
    ...current,
    ...body,
  };

  if (!ALLOWED_BACKLOG_VIEWS.has(next.default_backlog_view)) {
    throw badRequest("default_backlog_view is invalid");
  }
  if (!ALLOWED_BACKLOG_SORT_KEYS.has(next.default_backlog_sort_key)) {
    throw badRequest("default_backlog_sort_key is invalid");
  }
  if (typeof next.default_backlog_sort_reversed !== "boolean") {
    throw badRequest("default_backlog_sort_reversed must be boolean");
  }
  if (!ALLOWED_LANDING_PATHS.has(next.default_landing_path)) {
    throw badRequest("default_landing_path is invalid");
  }

  return next;
}

async function getPreferenceRow(userId) {
  const result = await pool.query(
    `SELECT default_backlog_view,
            default_backlog_sort_key,
            default_backlog_sort_reversed,
            default_landing_path
       FROM user_preferences
      WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getProfileRow(userId) {
  const result = await pool.query(
    `SELECT display_name, bio, avatar_icon, avatar_color
       FROM users
      WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const requestId = req.requestId || null;
    res.status(429).json({
      error: {
        code: "rate_limited",
        message: "Too many login attempts, please try again later.",
        requestId,
      },
    });
  },
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
      return next(badRequest("username and password are required"));
    }
    const passwordError = passwordPolicyError(password);
    if (passwordError) return next(badRequest(passwordError));

    // basic username guard
    if (!/^[\w.-]{3,30}$/.test(username)) {
      return next(badRequest("invalid username format"));
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (existing.rows.length > 0) {
      return next(conflict("username already taken"));
    }

    const hash = await bcrypt.hash(password, 10);
    const insert = await pool.query(
      `INSERT INTO users (username, password_hash, is_public)
       VALUES ($1, $2, false)
       RETURNING id, username, is_public, display_name, bio, avatar_icon, avatar_color`,
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

    res.status(201).json({ token, user: serializeUser(user) });
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
      return next(badRequest("username and password are required"));
    }

    const result = await pool.query(
      `SELECT u.id,
              u.username,
              u.password_hash,
              u.is_public,
              u.display_name,
              u.bio,
              u.avatar_icon,
              u.avatar_color,
              p.default_backlog_view,
              p.default_backlog_sort_key,
              p.default_backlog_sort_reversed,
              p.default_landing_path
         FROM users u
         LEFT JOIN user_preferences p ON p.user_id = u.id
        WHERE u.username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return next(unauthorized("invalid credentials"));
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return next(unauthorized("invalid credentials"));
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // Return without password hash
    res.json({ token, user: serializeUser(user) });
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
      `SELECT u.id,
              u.username,
              u.is_public,
              u.is_guest,
              u.guest_expires_at,
              u.created_at,
              u.display_name,
              u.bio,
              u.avatar_icon,
              u.avatar_color,
              p.default_backlog_view,
              p.default_backlog_sort_key,
              p.default_backlog_sort_reversed,
              p.default_landing_path
         FROM users u
         LEFT JOIN user_preferences p ON p.user_id = u.id
        WHERE u.id = $1`,
      [req.user.id]
    );
    if (me.rows.length === 0) {
      return next(notFound("user not found"));
    }
    res.json(serializeUser(me.rows[0]));
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
      return next(badRequest("is_public must be boolean"));
    }

    const updated = await pool.query(
      `UPDATE users
          SET is_public = $1
        WHERE id = $2
        RETURNING id, username, is_public, display_name, bio, avatar_icon, avatar_color`,
      [is_public, req.user.id]
    );

    const preferences = await getPreferenceRow(req.user.id);
    res.json({
      ...updated.rows[0],
      preferences: serializePreferences(preferences),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/auth/me/profile
 * Body: { display_name, bio, avatar_icon, avatar_color }
 * Update profile basics for the authenticated user
 */
router.patch("/me/profile", verifyToken, async (req, res, next) => {
  try {
    const current = await getProfileRow(req.user.id);
    if (!current) return next(notFound("user not found"));
    const profile = normalizeProfileInput(req.body || {}, current);
    const updated = await pool.query(
      `UPDATE users
          SET display_name = $1,
              bio = $2,
              avatar_icon = $3,
              avatar_color = $4
        WHERE id = $5
        RETURNING display_name, bio, avatar_icon, avatar_color`,
      [
        profile.display_name,
        profile.bio,
        profile.avatar_icon,
        profile.avatar_color,
        req.user.id,
      ]
    );

    res.json({
      display_name: updated.rows[0].display_name || "",
      bio: updated.rows[0].bio || "",
      avatar_icon: updated.rows[0].avatar_icon || DEFAULT_PROFILE.avatar_icon,
      avatar_color: updated.rows[0].avatar_color || DEFAULT_PROFILE.avatar_color,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/auth/me/preferences
 * Body: user preference fields
 * Upsert account-backed preferences for the authenticated user
 */
router.patch("/me/preferences", verifyToken, async (req, res, next) => {
  try {
    const current = serializePreferences(await getPreferenceRow(req.user.id));
    const nextPreferences = normalizePreferencesInput(req.body || {}, current);

    const updated = await pool.query(
      `INSERT INTO user_preferences (
         user_id,
         default_backlog_view,
         default_backlog_sort_key,
         default_backlog_sort_reversed,
         default_landing_path
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         default_backlog_view = EXCLUDED.default_backlog_view,
         default_backlog_sort_key = EXCLUDED.default_backlog_sort_key,
         default_backlog_sort_reversed = EXCLUDED.default_backlog_sort_reversed,
         default_landing_path = EXCLUDED.default_landing_path,
         updated_at = NOW()
       RETURNING default_backlog_view,
                 default_backlog_sort_key,
                 default_backlog_sort_reversed,
                 default_landing_path`,
      [
        req.user.id,
        nextPreferences.default_backlog_view,
        nextPreferences.default_backlog_sort_key,
        nextPreferences.default_backlog_sort_reversed,
        nextPreferences.default_landing_path,
      ]
    );

    res.json(serializePreferences(updated.rows[0]));
  } catch (err) {
    next(err);
  }
});

export default router;
