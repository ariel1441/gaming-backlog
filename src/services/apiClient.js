// src/services/apiClient.js
export class ApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? 0;
    this.details = details;
  }
}

// (Optional) token helpers, if you still use localStorage directly anywhere
const TOKEN_KEY = "auth_token";
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

const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "")
    : "";

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

/**
 * apiFetch(path, { method, body, headers, signal, auth })
 * - auth (default true): include Authorization header from local storage.
 */
export async function apiFetch(
  path,
  { method = "GET", body, headers, signal, auth = true } = {}
) {
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const reqHeaders = {
    ...(auth ? getAuthHeaders() : {}),
    ...(headers || {}),
  };

  const init = { method, headers: reqHeaders, signal };

  if (body != null) {
    if (isFormData) {
      init.body = body; // browser sets boundary
    } else {
      reqHeaders["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }

  const res = await fetch(buildUrl(path), init);

  if (res.ok) {
    return await parseJsonSafe(res);
  }

  const payload = await parseJsonSafe(res);
  const message =
    (payload && (payload.error || payload.message)) ||
    res.statusText ||
    "Request failed";
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
