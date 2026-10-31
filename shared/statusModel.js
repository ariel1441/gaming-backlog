// Stored values are stable keys. Display names can change without rewriting games.
export const STATUS_DEFINITIONS = Object.freeze([
  { value: "playing", label: "Playing", group: "playing" },
  { value: "plan to play soon", label: "Play soon", group: "planned" },
  { value: "plan to play", label: "Planned", group: "planned" },
  {
    value: "play when in the mood",
    label: "When in the mood",
    group: "planned",
  },
  {
    value: "played and should come back",
    label: "On hold",
    group: "returning",
  },
  { value: "occasional", label: "Occasional", group: "occasional" },
  { value: "maybe in the future", label: "Someday", group: "planned" },
  { value: "finished", label: "Finished", group: "done" },
  {
    value: "played alot but didnt finish",
    label: "Played enough",
    group: "done",
  },
  { value: "played a bit", label: "Played a bit", group: "tried" },
  { value: "not anytime soon", label: "Not anytime soon", group: "other" },
  { value: "played and wont come back", label: "Dropped", group: "tried" },
]);
export const STATUS_GROUP_ORDER = Object.freeze([
  "playing",
  "planned",
  "returning",
  "occasional",
  "done",
  "tried",
  "other",
]);
export const normalizeStatus = (status) =>
  String(status || "")
    .trim()
    .toLowerCase();
export const GROUP_DEFS = Object.freeze(
  Object.fromEntries(
    STATUS_GROUP_ORDER.map((group) => [
      group,
      Object.freeze([
        ...STATUS_DEFINITIONS.filter((status) => status.group === group).map(
          (status) => status.value,
        ),
        ...(group === "done" ? ["played a lot but didn't finish"] : []),
      ]),
    ]),
  ),
);
export const BUCKETS = Object.freeze({
  backlog: Object.freeze(["planned", "playing", "returning"]),
  done: Object.freeze(["done"]),
});
export const FALLBACK_STATUS_GROUPS = Object.freeze({
  groups: GROUP_DEFS,
  buckets: BUCKETS,
});
export const SELECTABLE_STATUSES = Object.freeze(
  STATUS_DEFINITIONS.map((status) => status.value),
);
export const RETIRED_STATUS = "recommended by someone";
export function statusGroupOf(status) {
  const value = normalizeStatus(status);
  return (
    STATUS_GROUP_ORDER.find((group) => GROUP_DEFS[group].includes(value)) ||
    "other"
  );
}
export const isFinishedStatus = (status) =>
  normalizeStatus(status) === "finished";
export const isPlayedEnough = (status) =>
  ["played alot but didnt finish", "played a lot but didn't finish"].includes(
    normalizeStatus(status),
  );
// Old alternate-outcome dates remain stored, but are not reported as completions.
export const completionDate = (game) =>
  isPlayedEnough(game?.status) ? null : game?.finished_at || null;
export const hasCompletedGame = (game) => isFinishedStatus(game?.status);
export const isNextUpEligible = (status, groupOf = statusGroupOf) =>
  ![
    "wishlist",
    "occasional",
    "not anytime soon",
    "played and wont come back",
    RETIRED_STATUS,
  ].includes(normalizeStatus(status)) &&
  (["planned", "returning"].includes(groupOf(status)) ||
    normalizeStatus(status) === "played a bit");
export const showsShortSteamActivity = (status) =>
  ["playing", "returning", "occasional", "done", "tried"].includes(
    statusGroupOf(status),
  );
export function statusDisplayLabel(status) {
  if (status == null) return "";
  const value = String(status).trim();
  if (isPlayedEnough(value)) return "Played enough";
  return (
    STATUS_DEFINITIONS.find((item) => item.value === normalizeStatus(value))
      ?.label || value
  );
}
