import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderRequestError,
  fetchProviderResponse,
  providerHttpError,
  readProviderJson,
} from "./providerFetch.js";

test("provider fetch aborts requests that exceed their deadline", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  try {
    await assert.rejects(
      fetchProviderResponse("rawg", "https://example.test", { timeoutMs: 5 }),
      (error) => error.code === "rawg_timeout" && error.status === 503,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider JSON rejects malformed responses with a stable code", async () => {
  await assert.rejects(
    readProviderJson("steam", new Response("not json", { status: 200 })),
    (error) => error.code === "steam_invalid_response",
  );
});

test("provider fetch stops reading chunked bodies at the configured byte limit", async () => {
  const originalFetch = globalThis.fetch;
  let pulls = 0;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        pull(controller) {
          pulls += 1;
          controller.enqueue(new Uint8Array(8));
          if (pulls >= 100) controller.close();
        },
      }),
      { status: 200 },
    );
  try {
    await assert.rejects(
      fetchProviderResponse("steam", "https://example.test", { maxBytes: 16 }),
      (error) => error.code === "steam_response_too_large",
    );
    assert.ok(pulls < 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider HTTP errors map throttling to a retryable service failure", () => {
  const error = providerHttpError("rawg", { status: 429 });
  assert.ok(error instanceof ProviderRequestError);
  assert.equal(error.code, "rawg_rate_limited");
  assert.equal(error.status, 503);
  assert.equal(error.retryable, true);
});
