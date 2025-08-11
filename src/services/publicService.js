// src/services/publicService.js
import { api } from "./apiClient";

// Correct paths: /api/public/:username and /api/public/:username/games
export function listPublicGames(username, opts = {}) {
  const u = encodeURIComponent(username);
  return api.get(`/api/public/${u}/games`, { auth: false, ...opts });
}

export function getPublicProfile(username, opts = {}) {
  const u = encodeURIComponent(username);
  return api.get(`/api/public/${u}`, { auth: false, ...opts });
}
