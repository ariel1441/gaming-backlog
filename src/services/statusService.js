// src/services/statusService.js
import { api } from "./apiClient";

// GET /api/games/statuses-list
export function listStatuses({ signal } = {}) {
  return api.get("/api/games/statuses-list", { signal });
}
