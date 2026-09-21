const STATUS_DISPLAY_LABELS = Object.freeze({
  "played and wont come back": "Dropped",
  "played alot but didnt finish": "Played a lot, but didn’t finish",
  "played a lot but didn't finish": "Played a lot, but didn’t finish",
});

export function statusDisplayLabel(status) {
  if (status == null) return "";
  const value = String(status).trim();
  if (!value) return "";
  return STATUS_DISPLAY_LABELS[value.toLowerCase()] || value;
}

export function statusOption(status) {
  return {
    value: status,
    label: statusDisplayLabel(status),
  };
}
