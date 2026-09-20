import test from "node:test";
import assert from "node:assert/strict";
import { groupNotifications } from "./notificationGroups.js";

function group(id, eventType, { source = "steam_wishlist", state = "resolved" } = {}) {
  return {
    id: String(id),
    events: [{ id, eventType, source, state }],
  };
}

test("Other activity follows the intentional Wishlist-first order", () => {
  const buckets = groupNotifications([
    group(1, "steam_new_game", { source: "steam_library" }),
    group(2, "wishlist_priority_changed"),
    group(3, "wishlist_removed"),
    group(4, "wishlist_added"),
  ]);
  const updates = buckets.find((bucket) => bucket.category === "updates");
  assert.deepEqual(
    updates.groups.map((item) => item.events[0].eventType),
    [
      "wishlist_added",
      "wishlist_removed",
      "wishlist_priority_changed",
      "steam_new_game",
    ],
  );
});
