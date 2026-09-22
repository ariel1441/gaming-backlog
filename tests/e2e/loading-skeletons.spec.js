import { expect, test } from "@playwright/test";

async function installLoadingFixture(page, { viewMode = "grid", wishlistDelay = 900 } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "loading-skeleton-test");
    localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let json = {};
    if (url.pathname === "/api/auth/me") {
      json = {
        id: 42,
        username: "loader",
        preferences: {
          default_backlog_view: viewMode,
          show_wishlist_in_backlog: false,
        },
      };
    } else if (url.pathname === "/api/wishlist") {
      await new Promise((resolve) => setTimeout(resolve, wishlistDelay));
      json = {
        items: [{ id: 1, name: "Loaded wish", active: true }],
        total: 1,
        snapshotVersion: "loading-test",
        facets: { collectionTotal: 1, genres: [], hoursBounds: { min: 0, max: 0 } },
      };
    } else if (url.pathname === "/api/games" && url.searchParams.has("limit")) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      json = {
        games: [{ id: 1, name: "Loaded backlog game", status: "playing" }],
        total: 1,
        snapshotVersion: "loading-test",
        facets: { collectionTotal: 1, genres: [], hoursBounds: { min: 0, max: 0 } },
      };
    } else if (url.pathname === "/api/meta/status-groups") {
      json = { groups: { playing: ["playing"], planned: [], done: [], other: [] }, buckets: {} };
    } else if (url.pathname === "/api/games/statuses-list") {
      json = ["playing"];
    } else if (["/api/games", "/api/personal-genres", "/api/next-up"].includes(url.pathname)) {
      json = [];
    }
    await route.fulfill({ json });
  });
}

test("Wishlist keeps a table-shaped skeleton through initial data loading without a zero count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installLoadingFixture(page, { viewMode: "table" });
  await page.goto("/wishlist");

  const skeleton = page.getByRole("status", { name: "Loading collection" });
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("data-view-mode", "table");
  await expect(page.getByText("0 games", { exact: true })).toHaveCount(0);

  await expect(page.getByRole("heading", { name: /wishlist/i })).toBeVisible();
  await expect(page.getByText("1 game", { exact: true })).toBeVisible();
});

test("Wishlist card loading fills two desktop rows and includes its taller price treatment", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 940 });
  await installLoadingFixture(page, { viewMode: "grid" });
  await page.goto("/wishlist");

  const skeleton = page.getByRole("status", { name: "Loading collection" });
  await expect(skeleton).toHaveAttribute("data-collection", "wishlist");
  await expect(skeleton.locator("[data-skeleton-card]")).toHaveCount(8);
  await expect(skeleton.locator("[data-wishlist-price]")).toHaveCount(8);
});

test("Backlog loading skeleton follows compact mode and resolves without a layout-family swap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installLoadingFixture(page, { viewMode: "compact" });
  await page.goto("/");

  const skeleton = page.getByRole("status", { name: "Loading collection" });
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("data-view-mode", "compact");
  await expect(page.getByText("0 games", { exact: true })).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Loaded backlog game" })).toBeVisible();
});
