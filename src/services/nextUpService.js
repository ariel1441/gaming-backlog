import { api } from "./apiClient";

export function getNextUp(opts = {}) {
  return api.get("/api/next-up", opts);
}

export function addToNextUp(gameId, opts = {}) {
  return api.post(`/api/next-up/${gameId}`, undefined, opts);
}

export function removeFromNextUp(gameId, opts = {}) {
  return api.del(`/api/next-up/${gameId}`, opts);
}

export function reorderNextUp(gameIds, opts = {}) {
  return api.put("/api/next-up/reorder", { gameIds }, opts);
}

export function startPlaying(gameId, opts = {}) {
  return api.post(`/api/next-up/${gameId}/start`, undefined, opts);
}
