export const THEME_STORAGE_KEY = "gaming_backlog_theme_v1";
export const DEFAULT_THEME_ID = "ember";

export const THEMES = Object.freeze([
  Object.freeze({
    id: "ember",
    name: "Ember",
    description: "The original warm orange Gaming Backlog theme.",
    appearance: "dark",
  }),
  Object.freeze({
    id: "black-red",
    name: "Obsidian Crimson",
    description: "Near-black surfaces with a deep crimson identity.",
    appearance: "dark",
  }),
  Object.freeze({
    id: "latte-mauve",
    name: "Lavender Rose",
    description: "A softly tinted light theme with lavender surfaces and rose accents.",
    appearance: "light",
  }),
  Object.freeze({
    id: "midnight-teal",
    name: "Midnight Teal",
    description: "A calm deep-green dark theme with teal and violet accents.",
    appearance: "dark",
  }),
]);

const THEME_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export function isThemeId(value) {
  return typeof value === "string" && THEME_BY_ID.has(value);
}

export function normalizeThemeId(value) {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export function getTheme(themeId) {
  return THEME_BY_ID.get(normalizeThemeId(themeId));
}
