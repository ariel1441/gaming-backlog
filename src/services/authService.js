import { api, setAuthToken } from "./apiClient";

export function register({ username, password }) {
  return api.post(
    "/api/auth/register",
    { username, password },
    { auth: false }
  );
}

export function login({ username, password }) {
  return api.post(
    "/api/auth/login",
    { username, password },
    { auth: false }
  );
}

export function me() {
  return api.get("/api/auth/me");
}

export function setPublic(isPublic) {
  return api.patch("/api/auth/me/is-public", { is_public: isPublic });
}

export function updatePreferences(preferences) {
  return api.patch("/api/auth/me/preferences", preferences);
}

export function updateProfile(profile) {
  return api.patch("/api/auth/me/profile", profile);
}

export function startDemo() {
  return api.post("/api/demo/start");
}

export function keepDemo({ username, password }) {
  return api.post("/api/demo/keep", { username, password });
}

export function discardDemo(options) {
  return api.post("/api/demo/discard", null, options);
}

export function heartbeatDemo() {
  return api.post("/api/demo/heartbeat");
}

export function logout() {
  setAuthToken(null);
}
