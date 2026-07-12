import test from "node:test";
import assert from "node:assert/strict";
import {
  apiFetch,
  ApiError,
  isNetworkFetchError,
  isTransientHttpStatus,
  onUnauthorized,
} from "./apiClient.js";

test("isNetworkFetchError detects browser fetch failures", () => {
  assert.equal(isNetworkFetchError(new TypeError("Failed to fetch")), true);
  assert.equal(
    isNetworkFetchError(new DOMException("Aborted", "AbortError")),
    false,
  );
});

test("apiFetch retries transient GET network failures", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await apiFetch("/api/test", {
      retries: 2,
      retryDelayMs: 0,
      auth: false,
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiFetch reports a friendly network error after retries are exhausted", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    await assert.rejects(
      apiFetch("/api/test", { retries: 0, auth: false }),
      (error) => {
        assert.equal(error instanceof ApiError, true);
        assert.equal(error.status, 0);
        assert.match(error.message, /Unable to reach the server/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiFetch preserves abort errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new DOMException("Aborted", "AbortError");
  };

  try {
    await assert.rejects(
      apiFetch("/api/test", { auth: false }),
      (error) => error.name === "AbortError",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("isTransientHttpStatus recognizes cold-start and rate-limit responses", () => {
  assert.equal(isTransientHttpStatus(503), true);
  assert.equal(isTransientHttpStatus(429), true);
  assert.equal(isTransientHttpStatus(404), false);
});

test("apiFetch retries transient GET HTTP responses", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) {
      return new Response(JSON.stringify({ error: "warming up" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await apiFetch("/api/test", {
      retries: 2,
      retryDelayMs: 0,
      auth: false,
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiFetch expires the session only for authenticated 401 responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map([["token", "valid-token"]]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  let status = 403;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "Denied" } }), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  let expirations = 0;
  const unsubscribe = onUnauthorized(() => {
    expirations += 1;
  });

  try {
    await assert.rejects(apiFetch("/api/private", { retries: 0 }), ApiError);
    assert.equal(expirations, 0, "authenticated 403 is a permission failure");

    await assert.rejects(
      apiFetch("/api/public", { retries: 0, auth: false }),
      ApiError,
    );
    assert.equal(expirations, 0, "public 403 cannot expire a session");

    status = 401;
    await assert.rejects(
      apiFetch("/api/public", { retries: 0, auth: false }),
      ApiError,
    );
    assert.equal(expirations, 0, "public 401 cannot expire a session");

    await assert.rejects(apiFetch("/api/private", { retries: 0 }), ApiError);
    assert.equal(expirations, 1, "authenticated 401 expires the session once");
    assert.equal(values.get("token"), "valid-token");
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  }
});
