import { api } from "./apiClient";
export function hideOtherActivityUpdates(snapshot, opts = {}) {
  return api.post('/api/activity/inbox/hide-other', { snapshot }, opts);
}

export function activateActivityInbox(opts = {}) { return api.post('/api/activity/inbox/activate', {}, opts); }
export function listActivityInbox(params = {}, opts = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value != null));
  return api.get(`/api/activity/inbox?${query}`, opts);
}
export function updateActivityInbox(eventIds, action, opts = {}) {
  return api.patch('/api/activity/inbox', { eventIds, action }, opts);
}

export function listActivityEvents(params = {}, opts = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get(`/api/activity${suffix}`, opts);
}

export function listSteamPlayHistory(params = {}, opts = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value != null));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get(`/api/activity/play-history${suffix}`, opts);
}

export function updateActivityEvent(id, action, opts = {}) {
  return api.patch(`/api/activity/${id}`, { action }, opts);
}
