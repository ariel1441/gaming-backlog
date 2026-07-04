import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_USER_PREFERENCES,
  normalizeUserPreferences,
  preferredLandingPath,
} from "./userPreferences.js";

test("normalizeUserPreferences fills defaults for missing preferences", () => {
  assert.deepEqual(normalizeUserPreferences(null), DEFAULT_USER_PREFERENCES);
});

test("normalizeUserPreferences keeps valid preference values", () => {
  assert.deepEqual(
    normalizeUserPreferences({
      default_backlog_view: "list",
      default_backlog_sort_key: "finishedDate",
      default_backlog_sort_reversed: true,
      default_landing_path: "/me",
    }),
    {
      default_backlog_view: "list",
      default_backlog_sort_key: "finishedDate",
      default_backlog_sort_reversed: true,
      default_landing_path: "/me",
    }
  );
});

test("normalizeUserPreferences rejects unknown values back to defaults", () => {
  assert.deepEqual(
    normalizeUserPreferences({
      default_backlog_view: "table",
      default_backlog_sort_key: "privateField",
      default_backlog_sort_reversed: "yes",
      default_landing_path: "https://example.com",
    }),
    DEFAULT_USER_PREFERENCES
  );
});

test("preferredLandingPath reads normalized landing preference", () => {
  assert.equal(
    preferredLandingPath({
      preferences: { default_landing_path: "/timeline" },
    }),
    "/timeline"
  );
  assert.equal(preferredLandingPath({}), "/");
});
