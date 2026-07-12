import test from "node:test";
import assert from "node:assert/strict";
import { buildPgConfig } from "./pg.js";

test("Postgres TLS config supports local off and verified managed SSL", () => {
  assert.equal(
    buildPgConfig("postgres://localhost/db", { PGSSL: "false" }).ssl,
    undefined,
  );
  assert.deepEqual(
    buildPgConfig("postgres://managed.example/db", {
      PGSSL: "true",
      NODE_ENV: "production",
      PGSSL_CA: "certificate",
    }).ssl,
    { rejectUnauthorized: true, ca: "certificate" },
  );
});

test("unverified Postgres TLS is restricted to an explicit development escape hatch", () => {
  assert.equal(
    buildPgConfig("postgres://managed.example/db", {
      PGSSL: "true",
      NODE_ENV: "development",
      PGSSL_ALLOW_UNVERIFIED_DEV: "true",
    }).ssl.rejectUnauthorized,
    false,
  );
  assert.throws(
    () =>
      buildPgConfig("postgres://managed.example/db", {
        PGSSL: "true",
        NODE_ENV: "production",
        PGSSL_ALLOW_UNVERIFIED_DEV: "true",
      }),
    /cannot be used in production/,
  );
});

test("unverified production TLS requires a production-only explicit escape hatch", () => {
  assert.equal(
    buildPgConfig("postgres://managed.example/db", {
      PGSSL: "true",
      NODE_ENV: "production",
      PGSSL_ALLOW_UNVERIFIED_PROD: "true",
    }).ssl.rejectUnauthorized,
    false,
  );
  assert.throws(
    () =>
      buildPgConfig("postgres://managed.example/db", {
        PGSSL: "true",
        NODE_ENV: "development",
        PGSSL_ALLOW_UNVERIFIED_PROD: "true",
      }),
    /can only be used in production/,
  );
  assert.equal(
    buildPgConfig("postgres://managed.example/db", {
      PGSSL: "true",
      NODE_ENV: "development",
      PGSSL_ALLOW_UNVERIFIED_PROD: "false",
    }).ssl.rejectUnauthorized,
    true,
  );
});
