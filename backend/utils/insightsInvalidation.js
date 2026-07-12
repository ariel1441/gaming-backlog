const INSIGHTS_FIELDS = [
  "status",
  "name",
  "how_long_to_beat",
  "hours_preferred_source",
  "hours_locked",
  "started_at",
  "finished_at",
  "my_genre",
];

export function affectsInsights(before = {}, after = {}) {
  return INSIGHTS_FIELDS.some(
    (field) => String(before[field] ?? "") !== String(after[field] ?? "")
  );
}
