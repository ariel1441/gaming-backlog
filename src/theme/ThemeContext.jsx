import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { THEMES, getTheme, normalizeThemeId } from "./themeRegistry.js";
import {
  applyThemeToRoot,
  getInitialTheme,
  persistTheme,
} from "./themeStorage.js";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(() => getInitialTheme());

  useEffect(() => {
    const normalizedThemeId = applyThemeToRoot(themeId);
    persistTheme(normalizedThemeId);
  }, [themeId]);

  const setTheme = useCallback((nextThemeId) => {
    setThemeIdState(normalizeThemeId(nextThemeId));
  }, []);

  const value = useMemo(
    () => ({
      themeId,
      theme: getTheme(themeId),
      themes: THEMES,
      setTheme,
    }),
    [setTheme, themeId],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
