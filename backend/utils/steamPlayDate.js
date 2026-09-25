import { calendarDay } from "./gamingActivityDay.js";

// This compatibility helper is for provider calendar dates. Observed activity
// intervals use the saved gaming activity day from the ledger instead.

export function steamPlayDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  // Explicit calendar dates already represent the user's chosen day.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return date.toISOString().slice(0, 10) === value ? value : null;
  }
  return calendarDay(date);
}
