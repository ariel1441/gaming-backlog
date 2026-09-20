import test from "node:test";
import assert from "node:assert/strict";
import {
  assertNotificationLabConfiguration,
  notificationLabEnabled,
} from "./notificationLab.js";

test("Notification Lab is disabled unless local development explicitly opts in", () => {
  assert.equal(notificationLabEnabled({ NODE_ENV: "development" }), false);
  assert.equal(
    notificationLabEnabled({
      NODE_ENV: "development",
      NOTIFICATION_LAB_ENABLED: "true",
    }),
    true,
  );
  assert.equal(
    notificationLabEnabled({
      NODE_ENV: "production",
      NOTIFICATION_LAB_ENABLED: "false",
    }),
    false,
  );
});

test("Notification Lab opt-in fails startup outside development", () => {
  for (const nodeEnv of ["production", "test", undefined]) {
    assert.throws(
      () => assertNotificationLabConfiguration({
        NODE_ENV: nodeEnv,
        NOTIFICATION_LAB_ENABLED: "true",
      }),
      /allowed only when NODE_ENV=development/,
    );
  }
});
