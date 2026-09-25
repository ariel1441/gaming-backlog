export const GAMING_ACTIVITY_TIMEZONE = "Asia/Jerusalem";
export const GAMING_ACTIVITY_CUTOFF_HOUR = 5;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAMING_ACTIVITY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: GAMING_ACTIVITY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function previousCalendarDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, date - 1));
  return previous.toISOString().slice(0, 10);
}

function dayOrdinal(day) {
  const [year, month, date] = day.split("-").map(Number);
  return Math.trunc(Date.UTC(year, month - 1, date) / 86_400_000);
}

export function gamingActivityDay(value) {
  const date = validDate(value);
  if (!date) return null;
  const parts = Object.fromEntries(
    dateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const localDay = `${parts.year}-${parts.month}-${parts.day}`;
  return Number(parts.hour) < GAMING_ACTIVITY_CUTOFF_HOUR
    ? previousCalendarDay(localDay)
    : localDay;
}

export function isGamingActivityCloseoutHour(value) {
  const date = validDate(value);
  if (!date) return false;
  const hour = dateTimeFormatter
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  return Number(hour) === GAMING_ACTIVITY_CUTOFF_HOUR;
}

export function gamingActivityCloseoutDay(value) {
  if (!isGamingActivityCloseoutHour(value)) return null;
  return previousCalendarDay(gamingActivityDay(value));
}

export function classifyGamingActivityInterval(previousObservedAt, observedAt) {
  const previousDay = gamingActivityDay(previousObservedAt);
  const observedDay = gamingActivityDay(observedAt);
  if (!previousDay || !observedDay) {
    return { precision: "uncertain", activityDay: null };
  }
  const distance = dayOrdinal(observedDay) - dayOrdinal(previousDay);
  if (distance === 0) {
    return { precision: "daily", activityDay: observedDay };
  }
  if (distance === 1) {
    return { precision: "daily", activityDay: previousDay };
  }
  return { precision: "uncertain", activityDay: null };
}

export function calendarDay(value) {
  const date = validDate(value);
  return date ? dayFormatter.format(date) : null;
}
