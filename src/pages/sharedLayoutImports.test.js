import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sharedLayoutComponents = [
  "AppPage",
  "PageHeader",
  "PageToolbar",
  "PageSection",
  "PageLoading",
  "PageError",
  "PageEmpty",
  "Breadcrumbs",
];

const requiredSharedPages = new Map([
  ["DiscoverPage.jsx", ["AppPage", "PageHeader", "PageToolbar", "PageSection"]],
  ["OwnerProfilePage.jsx", ["AppPage", "PageHeader"]],
  ["ReviewsPage.jsx", ["AppPage", "PageHeader", "PageSection"]],
  [
    path.join("Reviews", "ReviewsView.jsx"),
    ["AppPage", "PageHeader", "PageToolbar"],
  ],
  ["SettingsPage.jsx", ["AppPage", "PageHeader"]],
  ["SteamImportPage.jsx", ["AppPage", "PageHeader", "PageSection"]],
  [
    "SteamLibraryPage.jsx",
    ["AppPage", "PageHeader", "PageToolbar", "PageSection"],
  ],
  ["TimelinePage.jsx", ["AppPage", "PageHeader", "PageToolbar"]],
  [path.join("Insights", "InsightsPage.jsx"), ["AppPage", "PageHeader"]],
  [
    path.join("Lists", "ListsPage.jsx"),
    ["AppPage", "PageHeader", "PageSection"],
  ],
]);

function importedLayoutNames(source) {
  const matches = source.matchAll(
    /import\s*{([^}]*)}\s*from\s*["'](?:\.\.\/)+components\/layout["'];?/g,
  );

  return new Set(
    [...matches].flatMap((match) =>
      match[1]
        .split(",")
        .map((name) => name.trim().split(/\s+as\s+/)[0])
        .filter(Boolean),
    ),
  );
}

test("pages import every shared layout component they render", async () => {
  const files = [...requiredSharedPages.keys()];
  const failures = [];

  for (const file of files) {
    const source = await readFile(path.join(currentDir, file), "utf8");
    const imported = importedLayoutNames(source);

    for (const component of sharedLayoutComponents) {
      const usedInJsx = new RegExp(`<${component}(?:\\s|>)`).test(source);
      if (usedInJsx && !imported.has(component)) {
        failures.push(`${file}: ${component}`);
      }
    }

    for (const component of requiredSharedPages.get(file) || []) {
      if (!imported.has(component)) {
        failures.push(`${file}: expected ${component}`);
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Missing shared layout imports:\n${failures.join("\n")}`,
  );
});
