import test from "node:test";
import assert from "node:assert/strict";
import requestId from "./requestId.js";

function applyRequestId(incoming) {
  const req = { get: () => incoming };
  const headers = new Map();
  const res = { setHeader: (key, value) => headers.set(key, value) };
  let called = false;
  requestId(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(headers.get("X-Request-Id"), req.requestId);
  return req.requestId;
}

test("requestId preserves conservative upstream correlation IDs", () => {
  assert.equal(applyRequestId(" trace_01:edge.prod-2 "), "trace_01:edge.prod-2");
});

test("requestId replaces unsafe or oversized upstream values", () => {
  for (const value of [undefined, "line\r\nforged", "snowman-☃", "a".repeat(129)]) {
    assert.match(applyRequestId(value), /^[0-9a-f-]{36}$/);
  }
});
