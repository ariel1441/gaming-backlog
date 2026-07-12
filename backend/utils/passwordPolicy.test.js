import test from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_MAX_BYTES,
  passwordPolicyError,
} from "./passwordPolicy.js";

test("password policy enforces minimum characters and bcrypt byte limit", () => {
  assert.match(passwordPolicyError("short"), /at least 8/);
  assert.equal(passwordPolicyError("correct horse"), null);
  assert.equal(passwordPolicyError("a".repeat(PASSWORD_MAX_BYTES)), null);
  assert.match(passwordPolicyError("é".repeat(37)), /72 UTF-8 bytes/);
});
