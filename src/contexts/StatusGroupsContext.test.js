import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_STATUS_GROUPS,
  normalizeStatusGroupsPayload,
} from "./statusGroups.js";

test("normalizeStatusGroupsPayload keeps valid status group payloads", () => {
  const payload = {
    groups: { done: ["finished"] },
    buckets: { backlog: [], done: ["done"] },
  };

  assert.equal(normalizeStatusGroupsPayload(payload), payload);
});

test("normalizeStatusGroupsPayload falls back for malformed payloads", () => {
  assert.equal(normalizeStatusGroupsPayload(null), FALLBACK_STATUS_GROUPS);
  assert.equal(normalizeStatusGroupsPayload({ groups: {} }), FALLBACK_STATUS_GROUPS);
});
