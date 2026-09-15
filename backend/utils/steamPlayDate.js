// Steam supplies last-played evidence, not an exact first-session timestamp.
// Only pass frozen first-observation evidence here, never approval time.
const playDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
});

export function steamPlayDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  // Explicit calendar dates already represent the user's chosen day.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return date.toISOString().slice(0, 10) === value ? value : null;
  }
  return playDay.format(date);
}
