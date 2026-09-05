import { test, expect } from "@playwright/test";
import { steamCoverUrl } from "../../backend/utils/steamAssets.js";

// Recorded Steam assets shape. Load and decode the real CDN response in Chromium.
const cover = steamCoverUrl({
  asset_url_format: "steam/apps/951770/${FILENAME}?t=1787230575",
  library_capsule: "library_600x900.jpg",
});
const items = Array.from({ length: 444 }, (_, index) => ({
  id: index + 1,
  steamAppId: index < 436 ? String(100000 + index) : null,
  name:
    index === 0
      ? "First Steam game with a very long title that must remain readable on mobile"
      : index === 435
        ? "Last Steam game"
        : `Wishlist title ${index}`,
  active: true,
  steamActive: index < 436,
  localActive: index >= 436,
  providerOrder: index < 436 ? index : null,
  priority: 0,
  cover: index === 443 ? null : cover,
  genres: ["Adventure"],
  displayHLTB: 24,
  rating: 4.4,
  metacritic: 86,
  releaseDate: "2026-08-01",
  dateAdded: "2026-08-01T00:00:00Z",
}));
async function fixture(page, showWishlist = false) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "fixture");
    localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET")
      throw new Error(`Unexpected mutation: ${url.pathname}`);
    let json = {};
    if (url.pathname === "/api/auth/me")
      json = {
        id: 7,
        username: "owner",
        preferences: { show_wishlist_in_backlog: showWishlist },
      };
    else if (url.pathname === "/api/wishlist") {
      const offset = Number(url.searchParams.get("offset"));
      json = {
        items: items.slice(offset, offset + 100),
        total: 444,
        snapshotVersion: "stable",
        account: { wishlistSyncStatus: "synced" },
      };
    } else if (url.pathname === "/api/meta/status-groups")
      json = {
        groups: { planned: ["plan to play"], playing: [], done: [], other: [] },
        buckets: {},
      };
    else if (url.pathname === "/api/games/statuses-list")
      json = ["plan to play"];
    else if (
      ["/api/games", "/api/personal-genres", "/api/next-up"].includes(
        url.pathname,
      )
    )
      json = [];
    await route.fulfill({ json });
  });
}

for (const width of [1440, 375]) {
  test(`Wishlist parity and real decoded Steam covers at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fixture(page);
    await page.goto("/wishlist");
    await expect(page.locator("article h3").first()).toHaveText(items[0].name);
    const image = page.locator("article img").first();
    await expect(image).toHaveAttribute("src", cover);
    await expect
      .poll(
        () => image.evaluate((img) => img.complete && img.naturalWidth > 0),
        { timeout: 20000 },
      )
      .toBe(true);
    if (width < 768)
      await page.getByRole("button", { name: /Filters/ }).click();
    await page
      .getByRole("button", { name: /^Sort direction: ascending/ })
      .click();
    await expect(page.locator("article h3").first()).toHaveText(
      "Last Steam game",
    );
    await page.getByRole("button", { name: /^Compact(?: cards)?$/ }).click();
    await expect(page.locator("article h3").first()).toHaveText(
      "Last Steam game",
    );
    await page.getByRole("button", { name: "Table", exact: true }).click();
    if (width >= 1024) {
      await expect(
        page.getByRole("columnheader", { name: /Steam order/ }),
      ).toBeVisible();
      await expect(page.locator("tbody tr").first()).toContainText(
        "Last Steam game",
      );
      await expect(
        page.getByRole("columnheader", { name: /Est. hours/ }),
      ).toBeVisible();
    } else
      await expect(page.locator("article h3").first()).toHaveText(
        "Last Steam game",
      );
    await page
      .getByPlaceholder("Search wishlist...")
      .fill("Wishlist title 443");
    await expect(
      page.getByText("Wishlist title 443", { exact: true }).last(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Actions for/ })).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("Backlog preference merges all 444 intentions into normal filtering without lifecycle actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fixture(page, true);
  await page.goto("/");
  await expect(page.locator("article")).toHaveCount(444);
  await expect(
    page.getByRole("button", { name: /Actions for|Reorder|Add to Next Up/ }),
  ).toHaveCount(0);
  await page.getByPlaceholder(/Search/).fill("Wishlist title 443");
  await expect(
    page.locator("article h3").filter({ hasText: "Wishlist title 443" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(
    page.locator("tbody tr").filter({ hasText: "Wishlist title 443" }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Actions for/ })).toHaveCount(
    0,
  );
});
