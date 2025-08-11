// src/services/authService.js
import { api } from "./apiClient";
import { setAuthToken } from "./apiClient";

// POST /api/auth/register  { username, password }
export function register({ username, password }) {
  return api.post(
    "/api/auth/register",
    { username, password },
    { auth: false }
  );
}

// POST /api/auth/login  { username, password } -> { token, user }
export async function login({ username, password }) {
  const res = await api.post(
    "/api/auth/login",
    { username, password },
    { auth: false }
  );
  if (res?.token) setAuthToken(res.token);
  return res;
}

// GET /api/auth/me -> { user }
export function me() {
  return api.get("/api/auth/me");
}

// POST /api/auth/logout (if you have it)
export function logout() {
  setAuthToken(null);
  // optionally call backend logout if exists
}
