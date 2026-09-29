import test from "node:test";
import assert from "node:assert/strict";
import { collectionInitialLimit } from "./collectionLoading.js";

test("collection initial limits cover the visible desktop layout plus a small buffer", () => {
  assert.equal(collectionInitialLimit("grid", true), 12);
  assert.equal(collectionInitialLimit("compact", true), 18);
  assert.equal(collectionInitialLimit("list", true), 8);
  assert.equal(collectionInitialLimit("table", true), 20);
});

test("collection initial limits stay small on mobile", () => {
  assert.equal(collectionInitialLimit("grid", false), 4);
  assert.equal(collectionInitialLimit("compact", false), 6);
  assert.equal(collectionInitialLimit("list", false), 5);
  assert.equal(collectionInitialLimit("table", false), 5);
  assert.equal(collectionInitialLimit("unknown", false), 4);
});
