import {
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  getTheme,
  normalizeThemeId,
} from "./themeRegistry.js";

function getBrowserStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredTheme(storage = getBrowserStorage()) {
  if (!storage) return DEFAULT_THEME_ID;

  try {
    return normalizeThemeId(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function persistTheme(themeId, storage = getBrowserStorage()) {
  const normalizedThemeId = normalizeThemeId(themeId);
  if (!storage) return normalizedThemeId;

  try {
    storage.setItem(THEME_STORAGE_KEY, normalizedThemeId);
  } catch {
    // Theme application should still work when storage is unavailable.
  }

  return normalizedThemeId;
}

export function applyThemeToRoot(themeId, root) {
  const normalizedThemeId = normalizeThemeId(themeId);
  const theme = getTheme(normalizedThemeId);
  const targetRoot =
    root ?? (typeof document !== "undefined" ? document.documentElement : null);

  if (targetRoot) {
    targetRoot.dataset.theme = normalizedThemeId;
    targetRoot.style.colorScheme = theme.appearance;
  }

  return normalizedThemeId;
}

export function getInitialTheme(root) {
  const rootThemeId = root?.dataset?.theme;
  return normalizeThemeId(rootThemeId || readStoredTheme());
}
