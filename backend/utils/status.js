// backend/utils/status.js

/**
 * Normalize a status string to lowercase, trimmed.
 */
export const normStatus = (s) => (s || "").toLowerCase().trim();

/**
 * Statuses that should auto-set finished_at (do NOT include “played and wont come back”).
 * Note: includes two common variants from user input to tolerate typos.
 * Prefer validating status against your DB enum to avoid variants long-term.
 */
export const DONE_FINISH_SET = new Set([
  "finished",
  "played alot but didnt finish",
  "played a lot but didn't finish", // variant
]);
