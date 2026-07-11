export const NO_PERSONAL_GENRE_FILTER = "__no_personal_genre__";
export const NO_RAWG_GENRE_FILTER = "__no_rawg_genre__";

export function filterOptionLabel(value) {
  if (value === NO_PERSONAL_GENRE_FILTER) return "No genre";
  if (value === NO_RAWG_GENRE_FILTER) return "No RAWG genre";
  return String(value || "");
}
