// backend/utils/status.js

export const normStatus = (s) =>
  String(s || "")
    .toLowerCase()
    .trim();

/**
 * EDIT HERE ONLY to change status groups.
 * Keys are group IDs (used in URLs, filters, charts).
 * Values are the raw per-game status labels that belong to that group.
 */
export const GROUP_DEFS = Object.freeze({
  planned: [
    "plan to play soon",
    "plan to play",
    "play when in the mood",
    "maybe in the future",
  ],
  playing: ["playing", "played and should come back"],
  done: [
    "finished",
    "played alot but didnt finish", // canonical spelling you used
    "played a lot but didn't finish", // tolerated variant
  ],
});

/**
 * Semantic buckets so no one hardcodes meaning in routes/UI.
 * - backlog: groups that still require time (visualize in ETA)
 * - done: groups that are complete (exclude from ETA)
 */
export const BUCKETS = Object.freeze({
  backlog: ["planned", "playing"],
  done: ["done"],
});

// Precompute normalized sets for O(1) membership checks
export const GROUP_SETS = Object.freeze(
  Object.fromEntries(
    Object.entries(GROUP_DEFS).map(([group, list]) => [
      group,
      new Set(list.map(normStatus)),
    ])
  )
);

/** Map a raw per-game status string to its group, or "other" if no match. */
export function statusGroupOf(status) {
  const s = normStatus(status);
  for (const [group, set] of Object.entries(GROUP_SETS)) {
    if (set.has(s)) return group;
  }
  return "other";
}

/** Get the raw labels that belong to a given group. */
export function rawStatusesForGroup(group) {
  return GROUP_DEFS[group] ?? [];
}

/** Back-compat if referenced elsewhere (equivalent to GROUP_SETS.done) */
export const DONE_FINISH_SET = GROUP_SETS.done;
