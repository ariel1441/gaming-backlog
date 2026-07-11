import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSteamDate,
  formatSteamPlaytime,
  steamCapsuleUrl,
} from "./steamDisplay.js";

test("formatSteamPlaytime preserves compact and descriptive variants", () => {
  assert.equal(formatSteamPlaytime(90), "1.5h played");
  assert.equal(formatSteamPlaytime(0), "No Steam playtime");
  assert.equal(formatSteamPlaytime(0, { empty: "0h", suffix: "" }), "0h");
  assert.equal(formatSteamPlaytime(120, { empty: "0h", suffix: "" }), "2h");
});

test("steamCapsuleUrl supports capsule and icon preference", () => {
  const app = {
    steamAppId: "123",
    steamIconUrl: "https://example.com/icon.jpg",
  };
  assert.match(steamCapsuleUrl(app), /\/123\/capsule_184x69\.jpg$/);
  assert.equal(steamCapsuleUrl(app, { preferIcon: true }), app.steamIconUrl);
});

test("formatSteamDate rejects invalid values", () => {
  assert.equal(formatSteamDate("not-a-date"), "");
  assert.ok(formatSteamDate("2026-07-10T00:00:00.000Z"));
});
