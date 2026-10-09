import { test, expect } from "@playwright/test";
import { steamCoverUrl } from "../../backend/utils/steamAssets.js";

// Recorded Steam assets shape; decode fixture artwork without contacting the CDN.
const cover = steamCoverUrl({
  asset_url_format: "steam/apps/951770/${FILENAME}?t=1787230575",
  library_capsule: "library_600x900.jpg",
});
const landscapeCover = "https://cdn.akamai.steamstatic.com/steam/apps/951770/header.jpg";
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
const backlogGames = Array.from({ length: 120 }, (_, index) => ({
  id: index + 1,
  name: index === 119 ? "Backlog final game" : `Backlog title ${String(index).padStart(3, "0")}`,
  displayName: index === 119 ? "Backlog final game" : `Backlog title ${String(index).padStart(3, "0")}`,
  status: "plan to play",
  status_rank: 3,
  position: index * 1000,
  genres: index % 2 ? "Adventure" : "RPG",
  personal_genres: [],
  displayHLTB: 20,
  how_long_to_beat: 20,
}));
async function fixture(page, showWishlist = false, wishlistReads = [], backlog = null, backgroundDelayMs = 0) {
  await page.route("https://**.steamstatic.com/**", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="920" height="430"><rect width="920" height="430" fill="#214769"/></svg>',
  }));
  await page.addInitScript(() => {
    localStorage.setItem("token", "fixture");
    localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH" && /\/api\/games\/\d+\/position$/.test(url.pathname) && backlog) {
      const gameId = Number(url.pathname.match(/\/games\/(\d+)\/position$/)?.[1]);
      const { targetIndex } = route.request().postDataJSON();
      const collection = backlog.collection;
      const fromIndex = collection.findIndex((game) => game.id === gameId);
      const [game] = collection.splice(fromIndex, 1);
      collection.splice(targetIndex, 0, game);
      backlog.reorderPayloads.push({ id: gameId, targetIndex });
      return route.fulfill({ json: { game, rank_order: collection } });
    }
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
      wishlistReads.push(url.search);
      const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const direction = url.searchParams.get("direction") || "asc";
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 50);
      if (offset && backgroundDelayMs) await new Promise((resolve) => setTimeout(resolve, backgroundDelayMs));
      let filtered = query
        ? items.filter((item) => item.name.toLowerCase().includes(query))
        : [...items];
      if (direction === "desc") {
        filtered = [
          ...filtered.filter((item) => item.steamActive).reverse(),
          ...filtered.filter((item) => !item.steamActive),
        ];
      }
      json = {
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
        snapshotVersion: "stable",
        priceRevision: "account:1",
        account: { wishlistSyncStatus: "synced" },
        facets: {
          collectionTotal: 444,
          genres: ["Adventure"],
          hoursBounds: { min: 24, max: 24 },
        },
      };
    } else if (url.pathname === "/api/meta/status-groups")
      json = {
        groups: { planned: ["plan to play"], playing: [], done: [], other: [] },
        buckets: {},
      };
    else if (url.pathname === "/api/games/statuses-list")
      json = ["plan to play"];
    else if (url.pathname === "/api/games" && backlog && url.searchParams.has("limit")) {
      backlog.reads.push(url.search);
      const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 50);
      if (offset && backgroundDelayMs) await new Promise((resolve) => setTimeout(resolve, backgroundDelayMs));
      const filtered = query
        ? backlog.collection.filter((game) => game.name.toLowerCase().includes(query))
        : backlog.collection;
      json = {
        games: filtered.slice(offset, offset + limit),
        total: filtered.length,
        snapshotVersion: `backlog-${filtered.length}`,
        facets: {
          collectionTotal: backlog.collection.length,
          genres: ["Adventure", "RPG"],
          hoursBounds: { min: 20, max: 20 },
        },
      };
    } else if (
      ["/api/games", "/api/personal-genres", "/api/next-up"].includes(url.pathname)
    )
      json = [];
    await route.fulfill({ json });
  });
}

test("Backlog renders a small first view and completes once in the background", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const backlog = {
    reads: [],
    reorderPayloads: [],
    collection: backlogGames.map((game) => ({ ...game })),
  };
  await fixture(page, false, [], backlog, 250);
  await page.goto("/");
  await expect(page.locator("article")).toHaveCount(12);
  expect(backlog.reads.some((search) => search.includes("limit=12") && search.includes("offset=0"))).toBe(true);
  await expect(page.getByRole("button", { name: /Load more/ })).toHaveCount(0);

  const backlogScroller = page.locator("main");
  await backlogScroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  const scrollBeforeHydration = await backlogScroller.evaluate((element) => element.scrollTop);
  await expect(page.locator("article")).toHaveCount(120);
  const scrollAfterHydration = await backlogScroller.evaluate((element) => element.scrollTop);
  expect(scrollAfterHydration).toBeLessThanOrEqual(scrollBeforeHydration + 5);
  expect(backlog.reads.filter((search) => search.includes("include_summary=false"))).toHaveLength(2);
  expect(backlog.reads.some((search) => search.includes("limit=100") && search.includes("offset=12"))).toBe(true);
  expect(backlog.reads.some((search) => search.includes("limit=100") && search.includes("offset=112"))).toBe(true);

  await backlogScroller.evaluate((element) => element.scrollTo(0, 0));
  const first = page.locator("article").filter({ hasText: "Backlog title 000" });
  const second = page.locator("article").filter({ hasText: "Backlog title 001" });
  const source = await second.boundingBox();
  const target = await first.boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => backlog.reorderPayloads).toEqual([{ id: 2, targetIndex: 0 }]);
  await expect(page.locator("article h3").first()).toHaveText("Backlog title 001");

  await page.getByPlaceholder(/Search/).fill("final game");
  await expect(page.locator("article h3")).toHaveText(["Backlog final game"]);
  expect(backlog.reads.some((search) => search.includes("q=final+game"))).toBe(true);
});

test("Wishlist renders a small first view and completes without scroll-triggered requests", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const wishlistReads = [];
  await fixture(page, false, wishlistReads, null, 150);
  await page.goto("/wishlist");
  await expect(page.locator("article")).toHaveCount(12);
  expect(wishlistReads.some((search) => search.includes("limit=12") && search.includes("offset=0"))).toBe(true);
  await expect(page.getByRole("button", { name: /Load more/ })).toHaveCount(0);
  const wishlistScroller = page.locator("main");
  await wishlistScroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  const scrollBeforeHydration = await wishlistScroller.evaluate((element) => element.scrollTop);
  await expect(page.locator("article")).toHaveCount(444);
  const scrollAfterHydration = await wishlistScroller.evaluate((element) => element.scrollTop);
  expect(scrollAfterHydration).toBeLessThanOrEqual(scrollBeforeHydration + 5);
  expect(wishlistReads.filter((search) => search.includes("include_summary=false"))).toHaveLength(5);
  expect(wishlistReads.some((search) => search.includes("limit=100") && search.includes("offset=12"))).toBe(true);
  expect(wishlistReads.some((search) => search.includes("offset=412"))).toBe(true);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(444);
});

test("Backlog mobile renders four cards before background completion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const backlog = {
    reads: [],
    reorderPayloads: [],
    collection: backlogGames.map((game) => ({ ...game })),
  };
  await fixture(page, false, [], backlog, 200);
  await page.goto("/");
  await expect(page.locator("article")).toHaveCount(4);
  expect(backlog.reads.some((search) => search.includes("limit=4") && search.includes("offset=0"))).toBe(true);
  await expect(page.getByRole("button", { name: /Load more/ })).toHaveCount(0);
  await expect(page.locator("article")).toHaveCount(120);
  expect(backlog.reads.filter((search) => search.includes("include_summary=false"))).toHaveLength(2);
  expect(backlog.reads.some((search) => search.includes("limit=100") && search.includes("offset=4"))).toBe(true);
  expect(backlog.reads.some((search) => search.includes("offset=104"))).toBe(true);
});

for (const width of [1440, 375]) {
  test(`Wishlist parity and decoded Steam artwork fixtures at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fixture(page);
    await page.goto("/wishlist");
    await expect(page.locator("article h3").first()).toHaveText(items[0].name);
    const image = page.locator("article img").first();
    await expect(image).toHaveAttribute("src", landscapeCover);
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
    page.getByRole("button", { name: /Actions for|Reorder|Add to shortlist/ }),
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
