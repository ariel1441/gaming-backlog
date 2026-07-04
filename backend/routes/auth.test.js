import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { pool } = await import("../db.js");
const { default: authRouter } = await import("./auth.js");
const { default: errorHandler } = await import("../middleware/errorHandler.js");

function makeToken(payload = {}) {
  return jwt.sign({ id: 7, username: "tester", ...payload }, process.env.JWT_SECRET);
}

async function withServer(queryImpl, fn) {
  const originalQuery = pool.query;
  pool.query = queryImpl;

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use(errorHandler);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
}

async function request(baseUrl, path, { method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeToken()}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("GET /api/auth/me returns default preferences when no row exists", async () => {
  await withServer(
    async (text, values) => {
      assert.match(String(text), /LEFT JOIN user_preferences/);
      assert.deepEqual(values, [7]);
      return {
        rows: [
          {
            id: 7,
            username: "tester",
            is_public: false,
            is_guest: false,
            guest_expires_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/auth/me");

      assert.equal(res.status, 200);
      assert.deepEqual(res.body.preferences, {
        default_backlog_view: "grid",
        default_backlog_sort_key: "",
        default_backlog_sort_reversed: false,
        default_landing_path: "/",
      });
    }
  );
});

test("PATCH /api/auth/me/preferences upserts preferences for current user", async () => {
  const calls = [];
  await withServer(
    async (text, values) => {
      calls.push({ text: String(text), values });
      if (String(text).includes("FROM user_preferences")) {
        return { rows: [] };
      }
      if (String(text).includes("INSERT INTO user_preferences")) {
        return {
          rows: [
            {
              default_backlog_view: "list",
              default_backlog_sort_key: "finishedDate",
              default_backlog_sort_reversed: true,
              default_landing_path: "/me",
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/auth/me/preferences", {
        method: "PATCH",
        body: {
          default_backlog_view: "list",
          default_backlog_sort_key: "finishedDate",
          default_backlog_sort_reversed: true,
          default_landing_path: "/me",
        },
      });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        default_backlog_view: "list",
        default_backlog_sort_key: "finishedDate",
        default_backlog_sort_reversed: true,
        default_landing_path: "/me",
      });
      const insert = calls.find((call) =>
        call.text.includes("INSERT INTO user_preferences")
      );
      assert.deepEqual(insert.values, [7, "list", "finishedDate", true, "/me"]);
    }
  );
});

test("PATCH /api/auth/me/preferences rejects invalid preference values", async () => {
  await withServer(
    async () => ({ rows: [] }),
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/auth/me/preferences", {
        method: "PATCH",
        body: {
          default_backlog_view: "table",
          default_backlog_sort_key: "",
          default_backlog_sort_reversed: false,
          default_landing_path: "/",
        },
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "bad_request");
      assert.match(res.body.error.message, /default_backlog_view/);
    }
  );
});

test("PATCH /api/auth/me/profile updates profile basics for current user", async () => {
  const calls = [];
  await withServer(
    async (text, values) => {
      calls.push({ text: String(text), values });
      if (String(text).includes("SELECT display_name")) {
        return {
          rows: [
            {
              display_name: null,
              bio: null,
              avatar_icon: "gamepad",
              avatar_color: "orange",
            },
          ],
        };
      }
      if (String(text).includes("UPDATE users")) {
        return {
          rows: [
            {
              display_name: "Ariel",
              bio: "RPG backlog curator.",
              avatar_icon: "rune",
              avatar_color: "violet",
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/auth/me/profile", {
        method: "PATCH",
        body: {
          display_name: " Ariel ",
          bio: " RPG backlog curator. ",
          avatar_icon: "rune",
          avatar_color: "violet",
        },
      });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        display_name: "Ariel",
        bio: "RPG backlog curator.",
        avatar_icon: "rune",
        avatar_color: "violet",
      });
      const update = calls.find((call) => call.text.includes("UPDATE users"));
      assert.deepEqual(update.values, [
        "Ariel",
        "RPG backlog curator.",
        "rune",
        "violet",
        7,
      ]);
    }
  );
});

test("PATCH /api/auth/me/profile rejects invalid avatar values", async () => {
  await withServer(
    async (text) => {
      if (String(text).includes("SELECT display_name")) {
        return {
          rows: [
            {
              display_name: null,
              bio: null,
              avatar_icon: "gamepad",
              avatar_color: "orange",
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/auth/me/profile", {
        method: "PATCH",
        body: { avatar_icon: "witcher" },
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "bad_request");
      assert.match(res.body.error.message, /avatar_icon/);
    }
  );
});
