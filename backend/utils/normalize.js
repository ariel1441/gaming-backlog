/**
 * Normalize HowLongToBeat: accepts number/string/null, returns an integer >= 0 (clamped to 2000) or null.
 * Rounds to nearest integer (banker? no — standard: .5 rounds up).
 */
export function roundHLTB(input, { max = 9999 } = {}) {
  if (input === null || input === undefined || input === "") return null;
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n);
  return rounded > max ? max : rounded;
}

/**
 * Normalize my_score: accepts number/string/null, returns float in [0,10] with one decimal, or null.
 */
export function normalizeScore(input, { min = 0, max = 10 } = {}) {
  if (input === null || input === undefined || input === "") return null;
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(max, Math.max(min, n));
  return Math.round(clamped * 10) / 10;
}
