import test from "node:test";
import assert from "node:assert/strict";
import { appendWishlistPage } from "./useInfiniteWishlist.js";

const current = {
  items: [{ id: 1 }],
  total: 3,
  snapshotVersion: "membership-1",
  priceRevision: "account:4",
};

test("infinite Wishlist pages append a coherent saved snapshot", () => {
  assert.deepEqual(appendWishlistPage(current, {
    items: [{ id: 2 }],
    total: 3,
    snapshotVersion: "membership-1",
    priceRevision: "account:4",
  }), {
    items: [{ id: 1 }, { id: 2 }],
    hasMore: true,
  });
});

test("infinite Wishlist pages reject revisions and duplicate items", () => {
  assert.throws(() => appendWishlistPage(current, {
    items: [{ id: 2 }], total: 3, snapshotVersion: "membership-1", priceRevision: "account:5",
  }), (error) => error.code === "wishlist_revision_changed");
  assert.throws(() => appendWishlistPage(current, {
    items: [{ id: 1 }], total: 3, snapshotVersion: "membership-1", priceRevision: "account:4",
  }), /duplicate items/i);
});
