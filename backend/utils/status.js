import { GROUP_DEFS, normalizeStatus } from "../../shared/statusModel.js";
export { GROUP_DEFS, BUCKETS, statusGroupOf, isFinishedStatus, hasCompletedGame, completionDate, isNextUpEligible } from "../../shared/statusModel.js";
export const normStatus = normalizeStatus;
export const GROUP_SETS = Object.freeze(Object.fromEntries(
  Object.entries(GROUP_DEFS).map(([group, statuses]) => [group, new Set(statuses)]),
));
export const rawStatusesForGroup = (group) => GROUP_DEFS[group] || [];
export const DONE_FINISH_SET = GROUP_SETS.done;
