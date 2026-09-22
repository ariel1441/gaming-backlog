export const DEFAULT_USER_PREFERENCES = {
  default_backlog_view: "grid",
  default_backlog_sort_key: "",
  default_backlog_sort_reversed: false,
  default_landing_path: "/",
  show_wishlist_in_backlog: false,
};

export const backlogViewOptions = [
  { value: "grid", label: "Cards" },
  { value: "compact", label: "Compact cards" },
  { value: "list", label: "Rows" },
  { value: "table", label: "Table" },
];

export const backlogSortOptions = [
  { value: "", label: "Default order", defaultReversed: false },
  { value: "name", label: "Name", defaultReversed: false },
  { value: "addedDate", label: "Date added", defaultReversed: true },
  { value: "startedDate", label: "Started date", defaultReversed: true },
  { value: "finishedDate", label: "Finished date", defaultReversed: true },
  { value: "releaseDate", label: "Release date", defaultReversed: true },
  { value: "score", label: "My score", defaultReversed: true },
  { value: "estimatedHours", label: "Estimated time", defaultReversed: false },
  { value: "hoursPlayed", label: "Steam playtime", defaultReversed: true },
  { value: "metacritic", label: "Metacritic", defaultReversed: true },
  { value: "rawgRating", label: "RAWG rating", defaultReversed: true },
  { value: "steamLastPlayed", label: "Steam last played", defaultReversed: true },
  { value: "personalGenres", label: "Personal genres", defaultReversed: false },
];

export function defaultBacklogSortReversed(sortKey) {
  return backlogSortOptions.find((option) => option.value === sortKey)?.defaultReversed ?? false;
}

export const landingPathOptions = [
  { value: "/", label: "Backlog" },
  { value: "/next-up", label: "Play Next" },
  { value: "/me", label: "My profile" },
  { value: "/timeline", label: "Timeline" },
  { value: "/discover", label: "Discover" },
  { value: "/insights", label: "Insights" },
];

const backlogViewValues = new Set(
  backlogViewOptions.map((option) => option.value),
);
const backlogSortValues = new Set(
  backlogSortOptions.map((option) => option.value),
);
const landingPathValues = new Set(
  landingPathOptions.map((option) => option.value),
);

export function normalizeUserPreferences(preferences) {
  const source = preferences || {};
  const default_backlog_view = backlogViewValues.has(
    source.default_backlog_view,
  )
    ? source.default_backlog_view
    : DEFAULT_USER_PREFERENCES.default_backlog_view;
  const default_backlog_sort_key = backlogSortValues.has(
    source.default_backlog_sort_key,
  )
    ? source.default_backlog_sort_key
    : DEFAULT_USER_PREFERENCES.default_backlog_sort_key;
  const default_landing_path = landingPathValues.has(
    source.default_landing_path,
  )
    ? source.default_landing_path
    : DEFAULT_USER_PREFERENCES.default_landing_path;

  return {
    default_backlog_view,
    default_backlog_sort_key,
    default_backlog_sort_reversed:
      typeof source.default_backlog_sort_reversed === "boolean"
        ? source.default_backlog_sort_reversed
        : DEFAULT_USER_PREFERENCES.default_backlog_sort_reversed,
    default_landing_path,
    show_wishlist_in_backlog:
      typeof source.show_wishlist_in_backlog === "boolean"
        ? source.show_wishlist_in_backlog
        : DEFAULT_USER_PREFERENCES.show_wishlist_in_backlog,
  };
}

export function normalizeUserWithPreferences(user) {
  if (!user) return user;
  return {
    ...user,
    preferences: normalizeUserPreferences(user.preferences),
  };
}

export function preferredLandingPath(user) {
  return normalizeUserPreferences(user?.preferences).default_landing_path;
}
