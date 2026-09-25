function validDate(value, dateOnly = false) {
  if (!value) return null;
  const date = dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatDisplayDate(value, options = {}) {
  const date = validDate(value, options.dateOnly);
  if (!date) return value ? String(value) : null;
  const { dateOnly: _dateOnly, ...intlOptions } = options;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...intlOptions,
  }).format(date);
}

export function formatMonthDay(value, options = {}) {
  return formatDisplayDate(value, { month: "short", day: "numeric", year: undefined, ...options });
}

export function formatActivityDay(value) {
  return formatDisplayDate(value, { dateOnly: true, weekday: "long", month: "short", day: "numeric", year: undefined });
}

export function formatNumericDate(value) {
  const date = validDate(value);
  if (!date) return value ? String(value) : null;
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}
