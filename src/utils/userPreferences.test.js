import test from "node:test";
import assert from "node:assert/strict";
import {
  backlogSortOptions,
  DEFAULT_USER_PREFERENCES,
  defaultBacklogSortReversed,
  normalizeUserPreferences,
  preferredLandingPath,
} from "./userPreferences.js";

test("backlog sort options use natural directions and keep niche genre sorting last", () => {
  assert.equal(backlogSortOptions.some((option) => option.value === "status"), false);
  assert.equal(backlogSortOptions.at(-1)?.value, "personalGenres");
  assert.equal(defaultBacklogSortReversed("score"), true);
  assert.equal(defaultBacklogSortReversed("addedDate"), true);
  assert.equal(defaultBacklogSortReversed("estimatedHours"), false);
  assert.equal(defaultBacklogSortReversed("name"), false);
});

test("normalizeUserPreferences fills defaults for missing preferences", () => {
  assert.deepEqual(normalizeUserPreferences(null), DEFAULT_USER_PREFERENCES);
});

test("normalizeUserPreferences keeps valid preference values", () => {
  assert.deepEqual(
    normalizeUserPreferences({
      default_backlog_view: "table",
      default_backlog_sort_key: "score",
      default_backlog_sort_reversed: true,
      default_landing_path: "/me",
      show_wishlist_in_backlog: true,
    }),
    {
      default_backlog_view: "table",
      default_backlog_sort_key: "score",
      default_backlog_sort_reversed: true,
      default_landing_path: "/me",
      show_wishlist_in_backlog: true,
    },
  );
});

test("normalizeUserPreferences rejects unknown values back to defaults", () => {
  assert.deepEqual(
    normalizeUserPreferences({
      default_backlog_view: "timeline",
      default_backlog_sort_key: "privateField",
      default_backlog_sort_reversed: "yes",
      default_landing_path: "https://example.com",
    }),
    DEFAULT_USER_PREFERENCES,
  );
});

test("preferredLandingPath reads normalized landing preference", () => {
  assert.equal(
    preferredLandingPath({
      preferences: { default_landing_path: "/timeline" },
    }),
    "/timeline",
  );
  assert.equal(preferredLandingPath({}), "/");
});
