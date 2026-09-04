import { api } from "./apiClient";

export function listActivityEvents(params = {}, opts = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get(`/api/activity${suffix}`, opts);
}

export function updateActivityEvent(id, action, opts = {}) {
  return api.patch(`/api/activity/${id}`, { action }, opts);
}
