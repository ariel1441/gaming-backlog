import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_STORAGE_KEY,
  getTheme,
  isThemeId,
  normalizeThemeId,
} from "./themeRegistry.js";
import {
  applyThemeToRoot,
  getInitialTheme,
  persistTheme,
  readStoredTheme,
} from "./themeStorage.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "../..");

function createStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function readBootstrapConfig(source) {
  const match = source.match(
    /<script id="theme-bootstrap-config" type="application\/json">\s*([\s\S]*?)\s*<\/script>/,
  );

  assert.ok(match, "index.html must include the startup theme config");
  return JSON.parse(match[1]);
}

test("theme registry exposes all supported themes with Ember as default", () => {
  assert.equal(DEFAULT_THEME_ID, "ember");
  assert.equal(isThemeId("ember"), true);
  assert.equal(isThemeId("black-red"), true);
  assert.equal(isThemeId("latte-mauve"), true);
  assert.equal(isThemeId("midnight-teal"), true);
  assert.equal(isThemeId("unknown"), false);
  assert.equal(normalizeThemeId("unknown"), DEFAULT_THEME_ID);
  assert.equal(getTheme("unknown").id, DEFAULT_THEME_ID);
  assert.equal(getTheme("black-red").appearance, "dark");
  assert.equal(getTheme("latte-mauve").appearance, "light");
  assert.equal(getTheme("midnight-teal").appearance, "dark");
});

test("stored themes are validated and persisted", () => {
  const validStorage = createStorage({ [THEME_STORAGE_KEY]: "black-red" });
  const invalidStorage = createStorage({ [THEME_STORAGE_KEY]: "unknown" });

  assert.equal(readStoredTheme(validStorage), "black-red");
  assert.equal(readStoredTheme(invalidStorage), DEFAULT_THEME_ID);
  assert.equal(persistTheme("unknown", validStorage), DEFAULT_THEME_ID);
  assert.equal(validStorage.getItem(THEME_STORAGE_KEY), DEFAULT_THEME_ID);
});

test("applying a theme updates the document root contract", () => {
  const root = { dataset: {}, style: {} };

  assert.equal(applyThemeToRoot("ember", root), "ember");
  assert.equal(root.dataset.theme, "ember");
  assert.equal(root.style.colorScheme, "dark");
  assert.equal(getInitialTheme(root), "ember");
});

test("startup bootstrap config stays aligned with the application registry", async () => {
  const source = await readFile(path.join(projectRoot, "index.html"), "utf8");
  const config = readBootstrapConfig(source);
  const registryThemeIds = THEMES.map((theme) => theme.id).sort();
  const bootstrapThemeIds = Object.keys(config.themes).sort();

  assert.equal(config.storageKey, THEME_STORAGE_KEY);
  assert.equal(config.defaultTheme, DEFAULT_THEME_ID);
  assert.deepEqual(bootstrapThemeIds, registryThemeIds);

  for (const theme of THEMES) {
    assert.equal(config.themes[theme.id].appearance, theme.appearance);
  }
});

test("ThemeProvider wraps routing so public routes and portals share the root theme", async () => {
  const source = await readFile(path.join(projectRoot, "src/index.jsx"), "utf8");
  const providerStart = source.indexOf("<ThemeProvider>");
  const routerStart = source.indexOf("<BrowserRouter>");
  const routerEnd = source.indexOf("</BrowserRouter>");
  const providerEnd = source.indexOf("</ThemeProvider>");

  assert.ok(providerStart >= 0, "ThemeProvider must be mounted");
  assert.ok(providerStart < routerStart, "ThemeProvider must wrap BrowserRouter");
  assert.ok(routerEnd < providerEnd, "BrowserRouter must close inside ThemeProvider");
});


test("Settings exposes the registered themes through the shared theme context", async () => {
  const source = await readFile(
    path.join(projectRoot, "src/pages/Settings/ThemeSettings.jsx"),
    "utf8",
  );

  assert.match(source, /useTheme\(\)/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /data-theme=\{theme\.id\}/);
  assert.match(source, /onSelect=\{setTheme\}/);
});

test("each registered theme has a complete CSS variable scope", async () => {
  const source = await readFile(
    path.join(projectRoot, "src/styles/themes.css"),
    "utf8",
  );
  const requiredVariables = [
    "--color-primary",
    "--color-surface-bg",
    "--color-content-primary",
    "--color-action-primary",
    "--color-action-danger",
    "--chart-1",
    "--tooltip-text",
  ];

  for (const theme of THEMES) {
    const selector = theme.id === DEFAULT_THEME_ID
      ? `[data-theme="${theme.id}"]`
      : `[data-theme="${theme.id}"]`;
    const start = source.indexOf(selector);
    assert.ok(start >= 0, `Missing CSS scope for ${theme.id}`);
    const nextTheme = source.indexOf("\n[data-theme=", start + selector.length);
    const block = source.slice(start, nextTheme >= 0 ? nextTheme : undefined);

    for (const variable of requiredVariables) {
      assert.match(block, new RegExp(variable), `${theme.id} must define ${variable}`);
    }
  }
});
