import { FALLBACK_STATUS_GROUPS, normalizeStatus } from "../../shared/statusModel.js";
export { FALLBACK_STATUS_GROUPS, normalizeStatus } from "../../shared/statusModel.js";

export function createStatusSemantics(defs = FALLBACK_STATUS_GROUPS.groups) {
  const sets = Object.fromEntries(
    Object.entries(defs || {}).map(([group, statuses]) => [
      group,
      new Set((statuses || []).map(normalizeStatus)),
    ]),
  );
  const statusGroupOf = (status) => {
    const normalized = normalizeStatus(status);
    for (const [group, values] of Object.entries(sets)) {
      if (values.has(normalized)) return group;
    }
    return "other";
  };
  return {
    statusGroupOf,
    isDone: (status) => statusGroupOf(status) === "done",
    isPlaying: (status) => statusGroupOf(status) === "playing",
    isReturning: (status) => statusGroupOf(status) === "returning",
    rawStatusesForGroup: (group) => defs?.[group] || [],
  };
}

export const defaultStatusSemantics = createStatusSemantics();
