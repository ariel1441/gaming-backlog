export const FALLBACK_STATUS_GROUPS = Object.freeze({
  groups: {},
  buckets: { backlog: [], done: [] },
});

export function normalizeStatusGroupsPayload(payload) {
  return payload && payload.groups && payload.buckets
    ? payload
    : FALLBACK_STATUS_GROUPS;
}
