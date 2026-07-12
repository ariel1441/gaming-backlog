// src/services/apiClient.js
export class ApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? 0;
    this.details = details;
  }
}

const DEFAULT_GET_RETRIES = 3;
const DEFAULT_RETRY_DELAYS_MS = [700, 1600, 3200];
const NETWORK_ERROR_MESSAGE =
  "Unable to reach the server. It may still be waking up, so please try again.";

// Storage key unified with AuthContext
const TOKEN_KEY = "token";
const unauthorizedListeners = new Set();

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized() {
  for (const listener of unauthorizedListeners) listener();
}

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}
export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
export function getAuthHeaders() {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Support VITE_API_BASE_URL or VITE_API_BASE; strip trailing slash.
// In local Vite dev, default to the Express port used by npm run dev:back.
const API_BASE_RAW =
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_API_BASE_URL ||
      import.meta.env?.VITE_API_BASE ||
      (import.meta.env?.DEV ? "http://localhost:5000" : ""))) ||
  "";
const API_BASE = API_BASE_RAW.replace(/\/+$/, "");

function buildUrl(path) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${clean}`;
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms, signal) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    if (!signal) return;

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function isTransientHttpStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

export function isNetworkFetchError(error) {
  if (!error || error.name === "AbortError") return false;
  if (error instanceof TypeError) return true;
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
}

function retryDelayForAttempt(attempt, retryDelayMs) {
  if (typeof retryDelayMs === "function") return retryDelayMs(attempt);
  if (typeof retryDelayMs === "number") return retryDelayMs;
  return DEFAULT_RETRY_DELAYS_MS[attempt - 1] ?? DEFAULT_RETRY_DELAYS_MS.at(-1);
}

/**
 * apiFetch(path, { method, body, headers, signal, auth })
 * - auth (default true): include Authorization header from local storage.
 */
export async function apiFetch(
  path,
  {
    method = "GET",
    body,
    headers,
    signal,
    auth = true,
    keepalive,
    credentials,
    retries,
    retryDelayMs,
  } = {},
) {
  const requestMethod = String(method || "GET").toUpperCase();
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const reqHeaders = {
    ...(auth ? getAuthHeaders() : {}),
    ...(headers || {}),
  };

  const init = {
    method: requestMethod,
    headers: reqHeaders,
    signal,
    keepalive,
    credentials,
  };

  if (body != null) {
    if (isFormData) {
      init.body = body; // browser sets boundary
    } else {
      reqHeaders["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }

  const maxRetries =
    retries ??
    (requestMethod === "GET" || requestMethod === "HEAD"
      ? DEFAULT_GET_RETRIES
      : 0);
  let attempt = 0;
  let res;

  const retryableMethod = requestMethod === "GET" || requestMethod === "HEAD";

  while (attempt <= maxRetries) {
    try {
      res = await fetch(buildUrl(path), init);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (!isNetworkFetchError(error) || attempt >= maxRetries) {
        throw new ApiError(NETWORK_ERROR_MESSAGE, {
          status: 0,
          details: { cause: error?.message || String(error) },
        });
      }

      attempt += 1;
      if (signal?.aborted) throw error;
      await sleep(retryDelayForAttempt(attempt, retryDelayMs), signal);
      continue;
    }

    if (res.ok) return await parseJsonSafe(res);

    if (
      retryableMethod &&
      isTransientHttpStatus(res.status) &&
      attempt < maxRetries
    ) {
      attempt += 1;
      await sleep(retryDelayForAttempt(attempt, retryDelayMs), signal);
      continue;
    }

    break;
  }

  const payload = await parseJsonSafe(res);
  const apiError = payload && payload.error;
  const message =
    (apiError && typeof apiError === "object" && apiError.message) ||
    (typeof apiError === "string" && apiError) ||
    (payload && payload.message) ||
    res.statusText ||
    "Request failed";

  // AuthContext owns session cleanup so its in-memory state and storage cannot
  // diverge. Permission failures and explicitly public requests are local to
  // their caller and must never invalidate an existing session.
  if (res.status === 401 && auth && reqHeaders.Authorization) {
    notifyUnauthorized();
  }

  throw new ApiError(message, { status: res.status, details: payload });
}

export const api = {
  get: (path, opts) => apiFetch(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => apiFetch(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => apiFetch(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) =>
    apiFetch(path, { ...opts, method: "PATCH", body }),
  del: (path, opts) => apiFetch(path, { ...opts, method: "DELETE" }),
};

/**
 * getLatest(path, opts, key=path)
 * Cancels any in-flight request with the same key, ensuring only the latest response wins.
 * - If caller provides `opts.signal`, we *propagate* its abort into our controller.
 * Usage:
 *   getLatest('/api/games', {}, 'games-list').then(...)
 */
const inflight = new Map(); // key -> AbortController

export function getLatest(path, opts = {}, key = path) {
  const { signal: externalSignal, ...rest } = opts || {};

  // Cancel previous request with the same key
  try {
    inflight.get(key)?.abort();
  } catch {}

  const ac = new AbortController();
  inflight.set(key, ac);

  // Propagate caller abort to our controller (so unmounts still work)
  if (externalSignal) {
    if (externalSignal.aborted) {
      ac.abort();
    } else {
      externalSignal.addEventListener("abort", () => ac.abort(), {
        once: true,
      });
    }
  }

  return apiFetch(path, { ...rest, signal: ac.signal })
    .catch((e) => {
      if (e?.name === "AbortError") throw e;
      throw e;
    })
    .finally(() => {
      if (inflight.get(key) === ac) inflight.delete(key);
    });
}
