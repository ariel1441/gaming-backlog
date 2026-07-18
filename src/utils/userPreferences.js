export const DEFAULT_USER_PREFERENCES = {
  default_backlog_view: "grid",
  default_backlog_sort_key: "",
  default_backlog_sort_reversed: false,
  default_landing_path: "/",
};

export const backlogViewOptions = [
  { value: "grid", label: "Cards" },
  { value: "compact", label: "Compact cards" },
  { value: "list", label: "Rows" },
];

export const backlogSortOptions = [
  { value: "", label: "Default order" },
  { value: "name", label: "Name" },
  { value: "hoursPlayed", label: "Hours" },
  { value: "rawgRating", label: "RAWG rating" },
  { value: "metacritic", label: "Metacritic" },
  { value: "releaseDate", label: "Release date" },
  { value: "startedDate", label: "Started date" },
  { value: "finishedDate", label: "Finished date" },
  { value: "steamLastPlayed", label: "Steam last played" },
];

export const landingPathOptions = [
  { value: "/", label: "Backlog" },
  { value: "/next-up", label: "Play Next" },
  { value: "/me", label: "My profile" },
  { value: "/timeline", label: "Timeline" },
  { value: "/discover", label: "Discover" },
  { value: "/insights", label: "Insights" },
];

const backlogViewValues = new Set(backlogViewOptions.map((option) => option.value));
const backlogSortValues = new Set(backlogSortOptions.map((option) => option.value));
const landingPathValues = new Set(landingPathOptions.map((option) => option.value));

export function normalizeUserPreferences(preferences) {
  const source = preferences || {};
  const default_backlog_view = backlogViewValues.has(source.default_backlog_view)
    ? source.default_backlog_view
    : DEFAULT_USER_PREFERENCES.default_backlog_view;
  const default_backlog_sort_key = backlogSortValues.has(
    source.default_backlog_sort_key
  )
    ? source.default_backlog_sort_key
    : DEFAULT_USER_PREFERENCES.default_backlog_sort_key;
  const default_landing_path = landingPathValues.has(source.default_landing_path)
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
