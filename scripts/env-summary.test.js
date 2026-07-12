import test from "node:test";
import assert from "node:assert/strict";
import { redactEnvironmentValue } from "./env-summary.js";

test("environment summary reveals only allowlisted scalar values", () => {
  assert.equal(redactEnvironmentValue("PORT", "5000"), "5000");
  assert.equal(redactEnvironmentValue("JWT_SECRET", "secret"), "<set: 6 bytes>");
  assert.equal(
    redactEnvironmentValue("STEAM_MOCK_OWNED_GAMES_JSON", '[{"appid":10}]'),
    "<set: 14 bytes>",
  );
  assert.equal(
    redactEnvironmentValue("STEAM_MOCK_PLAYER_SUMMARY_JSON", "private-user-data"),
    "<set: 17 bytes>",
  );
});

test("environment summary redacts database credentials and usernames", () => {
  assert.equal(
    redactEnvironmentValue(
      "DATABASE_URL",
      "postgres://private-user:secret@localhost:5432/game_backlog",
    ),
    "postgres://***@localhost:5432/game_backlog",
  );
  assert.equal(redactEnvironmentValue("DATABASE_URL", "not a URL"), "<invalid>");
});
