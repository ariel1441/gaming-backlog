import { api } from "./apiClient";

export function seedNotificationLab(scenario = "all", opts = {}) {
  return api.post("/api/dev/notification-lab/seed", { scenario }, opts);
}

export function resetNotificationLab(opts = {}) {
  return api.post("/api/dev/notification-lab/reset", {}, opts);
}
