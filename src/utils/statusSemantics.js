export const FALLBACK_STATUS_GROUPS = Object.freeze({
  groups: Object.freeze({
    planned: ["plan to play soon", "plan to play", "play when in the mood", "maybe in the future"],
    playing: ["playing", "played and should come back"],
    done: ["finished", "played alot but didnt finish", "played a lot but didn't finish"],
  }),
  buckets: Object.freeze({ backlog: ["planned", "playing"], done: ["done"] }),
});

export const normalizeStatus = (status) => String(status || "").trim().toLowerCase();

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
    rawStatusesForGroup: (group) => defs?.[group] || [],
  };
}

export const defaultStatusSemantics = createStatusSemantics();
