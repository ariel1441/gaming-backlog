export const NO_PERSONAL_GENRE_FILTER = "__no_personal_genre__";
export const NO_RAWG_GENRE_FILTER = "__no_rawg_genre__";

export const RAWG_STATUS_LABELS = Object.freeze({
  linked: "RAWG linked",
  missing: "No RAWG match",
  review: "Needs review",
  incomplete: "Metadata incomplete",
  failed: "Refresh failed",
});

export const RAWG_STATUS_OPTIONS = [
  ...Object.entries(RAWG_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export function rawgMetadataState(game) {
  const workStatus = game?.metadataWork?.status || game?.metadataStatus;
  if (workStatus === "review") return "review";
  if (workStatus === "failed") return "failed";
  if (workStatus === "unmatched" && game?.metadataWork?.issue === "rawg_metadata_incomplete") {
    return "incomplete";
  }
  const rawgId = game?.rawg_id ?? game?.rawgId;
  if (rawgId != null && String(rawgId).trim() !== "") {
    if (Object.prototype.hasOwnProperty.call(game || {}, "metadataQuality") && game.metadataQuality !== "full") return "incomplete";
    if (game?.metadataWork?.issue === "rawg_metadata_incomplete") return "incomplete";
    return "linked";
  }
  return "missing";
}

export function rawgMetadataStateLabel(state) {
  return RAWG_STATUS_LABELS[state] || "Metadata pending";
}

export function filterOptionLabel(value) {
  if (value === NO_PERSONAL_GENRE_FILTER) return "No genre";
  if (value === NO_RAWG_GENRE_FILTER) return "No RAWG genre";
  return String(value || "");
}
