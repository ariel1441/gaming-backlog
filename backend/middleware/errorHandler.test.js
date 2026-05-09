import test from "node:test";
import assert from "node:assert/strict";
import errorHandler from "./errorHandler.js";
import { conflict, serviceUnavailable } from "../utils/httpError.js";

function runErrorHandler(err) {
  const previousEnv = process.env.NODE_ENV;
  const previousConsoleError = console.error;
  process.env.NODE_ENV = "production";
  console.error = () => {};

  const req = {
    method: "GET",
    originalUrl: "/test",
    requestId: "req-test",
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    errorHandler(err, req, res, () => {});
    return res;
  } finally {
    process.env.NODE_ENV = previousEnv;
    console.error = previousConsoleError;
  }
}

test("errorHandler formats intentional HTTP errors with requestId", () => {
  const res = runErrorHandler(conflict("username already taken"));

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: {
      code: "conflict",
      message: "username already taken",
      requestId: "req-test",
    },
  });
});

test("errorHandler preserves service unavailable code", () => {
  const res = runErrorHandler(serviceUnavailable("Demo is disabled"));

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: {
      code: "service_unavailable",
      message: "Demo is disabled",
      requestId: "req-test",
    },
  });
});

test("errorHandler maps known Postgres errors", () => {
  const res = runErrorHandler({ code: "23505" });

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: {
      code: "conflict",
      message: "Resource already exists",
      requestId: "req-test",
    },
  });
});
