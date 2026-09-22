import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

function isCurrentSale(item, now = Date.now()) {
  const price = item.steamPrice;
  return Boolean(
    price?.monitoring && !price.stale && !price.errorCode &&
    ["available", "free"].includes(price.status) && price.currency === "ILS" &&
    Number.isSafeInteger(price.currentMinor) && price.currentMinor >= 0 &&
    Number.isFinite(Date.parse(price.observedAt)) &&
    now - Date.parse(price.observedAt) <= 36 * 60 * 60 * 1000 &&
    price.discountPercent > 0 && price.regularMinor > price.currentMinor
  );
}

function wishlistPage(items, uri) {
  const params = uri.searchParams;
  let filtered = [...items];
  if (params.get("on_sale") === "true") filtered = filtered.filter((item) => isCurrentSale(item));
  if (params.get("price_attention") === "true") filtered = filtered.filter((item) =>
    item.steamPrice?.errorCode && item.steamPrice.errorCode !== "steam_price_unsupported_type");
  const direction = params.get("direction") === "desc" ? -1 : 1;
  const sort = params.get("sort") || "provider_order";
  filtered.sort((left, right) => {
    let result;
    if (sort === "price") {
      result = Number(left.steamPrice?.currentMinor ?? Number.MAX_SAFE_INTEGER) -
        Number(right.steamPrice?.currentMinor ?? Number.MAX_SAFE_INTEGER);
    } else if (sort === "discount") {
      result = Number(left.steamPrice?.discountPercent ?? -1) - Number(right.steamPrice?.discountPercent ?? -1);
    } else if (sort === "name") result = left.name.localeCompare(right.name);
    else result = Number(left.providerOrder ?? Number.MAX_SAFE_INTEGER) - Number(right.providerOrder ?? Number.MAX_SAFE_INTEGER);
    return result * direction || Number(left.id) - Number(right.id);
  });
  const total = filtered.length;
  const limit = Number(params.get("limit") || 50);
  const offset = Number(params.get("offset") || 0);
  return {
    items: filtered.slice(offset, offset + limit),
    total,
    snapshotVersion: "m1",
    facets: params.get("include_summary") === "false" ? undefined : {
      collectionTotal: items.length,
      genres: ["Adventure"],
      hoursBounds: { min: 12, max: 12 },
    },
    limit,
    offset,
  };
}

for (const [label, viewport] of [
  ["desktop", { width: 1920, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  test(`C.5 ${label}: Backlog parity, saved background results, sale controls and inbox`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = [],
      mutations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("token", "experience-test");
      localStorage.setItem("seen_onboarding_v1", "1");
      localStorage.setItem("gaming_backlog_sidebar_collapsed_v1", "0");
    });
    const observedAt = new Date().toISOString();
    let revision = "1",
      background = false,
      failReads = false,
      inboxRead = false,
      inboxHidden = false;
    const price = {
      currency: "ILS",
      country: "IL",
      currentMinor: 500,
      regularMinor: 1000,
      discountPercent: 50,
      status: "available",
      availability: "available",
      monitoring: true,
      monitoringReason: "eligible",
      observedAt,
    };
    const games = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      name: index === 0 ? "Shared artwork game" : `Game ${index + 1}`,
      cover: index === 0 ? "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3321460/hash/library_capsule.jpg" : index === 7 ? null : "/experience-cover.svg",
      status: "plan to play",
      genres: ["Adventure"],
      how_long_to_beat: 12,
      position: index,
      description: "<p>A saved description.</p>",
    }));
    const items = games.map((game, index) => ({
      ...game,
      cover: index === 0 ? "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3321460/hash/library_capsule.jpg" : game.cover,
      active: true,
      steamActive: true,
      steamAppId: String(100 + index),
      providerOrder: index,
      metadataComplete: true,
      steamStoreUrl: `https://store.steampowered.com/app/${100 + index}?cc=il`,
      steamPrice:
        index === 1
          ? {
              ...price,
              currentMinor: 0,
              regularMinor: 0,
              discountPercent: 0,
              status: "free",
              availability: "free",
            }
          : index === 2
            ? {
                ...price,
                status: "failed",
                errorCode: "steam_price_offer_uncertain",
                stale: true,
              }
            : index === 3
              ? { ...price, currentMinor: null, status: "not_checked" }
              : { ...price, currentMinor: 500 + index * 10 },
    }));
    const account = () => ({
      id: 1,
      autoSyncEnabled: true,
      wishlistSyncStatus: "synced",
      priceSyncStatus: "partial",
      lastWishlistSyncAt: observedAt,
      lastLibrarySyncAt: observedAt,
      lastPriceSyncAt: observedAt,
      priceRevision: revision,
    });
    const event = {
      id: 101,
      source: "steam_prices",
      eventKind: "fact",
      eventType: "steam_price_drop",
      wishlistItemId: 1,
      syncRunId: 9,
      title: games[0].name,
      payload: { currency: "ILS", previousMinor: 1000, currentMinor: 500 },
      observedAt,
    };
    const portrait = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#214769"/></svg>';
    const landscape = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#214769"/></svg>';
    await page.route("https://**.steamstatic.com/**", (route) => {
      const isPoster = route.request().url().includes("library_capsule");
      const preview = process.env.ARTWORK_PREVIEW_DIR;
      return route.fulfill({
        contentType: preview && !isPoster ? "image/jpeg" : "image/svg+xml",
        body: preview && !isPoster ? readFileSync(join(preview, "wishlist-3321460-header.jpg")) : isPoster ? portrait : landscape,
      });
    });
    await page.route("**/experience-cover.svg", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#214769"/><circle cx="450" cy="300" r="220" fill="#db4455"/><path d="M0 0L900 600M900 0L0 600" stroke="#e9c860" stroke-width="24"/></svg>',
      }),
    );
    await page.route("**/api/**", async (route) => {
      const uri = new URL(route.request().url()),
        path = uri.pathname,
        method = route.request().method();
      const json = (body) => route.fulfill({ json: body });
      if (method !== "GET") mutations.push(path);
      if (path === "/api/auth/me")
        return json({
          id: 99,
          username: "experience",
          preferences: { default_backlog_view: "grid" },
        });
      if (path === "/api/meta/status-groups")
        return json({
          groups: {
            planned: ["plan to play"],
            playing: ["playing"],
            done: ["finished"],
            other: [],
          },
          buckets: {},
        });
      if (path === "/api/wishlist/1/move-to-backlog" && method === "POST") {
        expect(route.request().postDataJSON()).toEqual({ status: "plan to play" });
        return json({ gameId: 1, wishlistItemId: 1 });
      }
      if (path === "/api/games") return json(games);
      if (path === "/api/games/statuses-list")
        return json(["plan to play", "playing", "finished"]);
      if (path === "/api/steam/sync-health")
        return json({
          account: account(),
          activeJob: background
            ? {
                id: "background-job",
                syncKind: "wishlist_prices",
                status: "running",
                processed: 2,
                total: 8,
              }
            : null,
          runs: [],
          lastScheduledAt: observedAt,
        });
      if (path === "/api/wishlist") {
        if (failReads)
          return route.fulfill({
            status: 503,
            json: { error: { message: "Saved read unavailable" } },
          });
        return json({
          ...wishlistPage(items, uri),
          account: account(),
          priceRevision: revision,
          priceHealth: {
            eligible: 8,
            observed: 7,
            fresh: 6,
            unchecked: 1,
            verification: 1,
            retrying: 0,
            failed: 1,
          },
          metadata: {},
        });
      }
      if (path === "/api/activity/inbox/activate")
        return json({ activated: true });
      if (path === "/api/activity/inbox" && method === "PATCH") {
        const body = route.request().postDataJSON();
        if (body.action === "mark_read") inboxRead = true;
        if (body.action === "dismiss") inboxHidden = true;
        return json({ updated: 2 });
      }
      if (path === "/api/activity/inbox")
        return json({
          snapshot: "102",
          nextCursor: null,
          counts: { attention: 0, updates: inboxHidden ? 0 : 2 },
          groups:
            inboxHidden || uri.searchParams.get("section") === "attention"
              ? []
              : [
                  {
                    id: "102",
                    observedAt,
                    unseen: !inboxRead,
                    events: [
                      event,
                      { ...event, id: 102, eventType: "steam_sale_started" },
                    ],
                  },
                ],
        });
      return json({});
    });
    await page.goto("/");
    await expect(
      page.getByRole("button", {
        name: `Open details for ${games[0].name}`,
        exact: true,
      }),
    ).toBeVisible();
    const measure = () =>
      page
        .locator("article")
        .first()
        .evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const img = element.querySelector("img");
          return {
            width: rect.width,
            left: rect.left,
            imageHeight: img.getBoundingClientRect().height,
            fit: getComputedStyle(img).objectFit,
          };
        });
    await expect.poll(() => page.locator("article").first().locator("img").evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    const backlog = await measure();
    await page
      .getByRole("button", {
        name: `Open details for ${games[0].name}`,
        exact: true,
      })
      .click();
    const backlogModal = await page
      .getByRole("dialog")
      .locator("h2")
      .textContent();
    expect(backlogModal).toBe(games[0].name);
    await page.screenshot({ path: testInfo.outputPath(`backlog-modal-${label}.png`) });
    await page.keyboard.press("Escape");
    await page.goto("/wishlist");
    await expect(page.getByRole("heading", { name: /wishlist$/i })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(8);
    await expect(page.locator("article").first().locator("img")).toHaveAttribute("src", "https://cdn.akamai.steamstatic.com/steam/apps/3321460/header.jpg");
    await expect.poll(() => page.locator("article").first().locator("img").evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`wishlist-artwork-${label}.png`) });
    const wishlist = await measure();
    expect(Math.abs(backlog.width - wishlist.width)).toBeLessThan(2);
    expect(Math.abs(backlog.left - wishlist.left)).toBeLessThan(2);
    expect(Math.abs(wishlist.imageHeight - backlog.imageHeight)).toBeLessThan(1);
    expect(wishlist.fit).toBe(backlog.fit);
    expect(wishlist.fit).toBe("cover");
    expect(wishlist.imageHeight).toBeCloseTo(256, 3);
    if (label === "desktop") {
      const positions = await page
        .locator("article")
        .evaluateAll((elements) =>
          elements.map((el) => Math.round(el.getBoundingClientRect().top)),
        );
      expect(positions.filter((top) => Math.abs(top - positions[0]) < 5)).toHaveLength(4);
    }
    await expect(page.getByText(/^Observed /)).toHaveCount(0);
    await page
      .getByRole("button", {
        name: `Open details for ${games[0].name}`,
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { name: games[0].name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("A saved description."),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Refresh price", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Edit game", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog").locator('img[src$="header.jpg"]')).toHaveCount(2);
    if (label === "desktop") await expect(page.getByRole("dialog").locator('img[src$="library_capsule.jpg"]')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`wishlist-modal-${label}.png`),
    });
    await page.keyboard.press("Escape");
    await page.route("https://cdn.akamai.steamstatic.com/**", (route) => route.fulfill({ status: 404, body: "" }));
    await page.reload();
    const fallbackImage = page.locator("article").first().locator("img");
    await expect(fallbackImage).toHaveAttribute("src", items[0].cover);
    await expect(fallbackImage).toHaveCSS("object-fit", "cover");
    if (label === "mobile")
      await page
        .getByRole("button", { name: "Filters and view", exact: true })
        .click();
    await page.getByRole("button", { name: "On sale", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(5);
    await page.locator("#backlog-sort").click();
    await page
      .getByRole("option", { name: "Price (ILS)", exact: true })
      .click();
    await expect(
      page.locator("article").first().getByRole("heading"),
    ).toHaveText(games[0].name);
    await page.getByRole("button", { name: /Sort direction/ }).click();
    await expect(
      page.locator("article").first().getByRole("heading"),
    ).toHaveText(games[7].name);
    await page.locator("#backlog-sort").click();
    await page.getByRole("option", { name: "Discount %", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Sort direction: descending. Change to ascending.",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "On sale", exact: true }).click();
    await page
      .getByRole("button", { name: "Manage Steam Wishlist updates", exact: true })
      .click();
    await expect(page.getByText("Membership Updated today", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 price needs attention/)).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Steam sync settings' })).toBeVisible();
    await page.getByRole("menuitem", { name: "Show 1 price needing attention", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.locator("article").getByRole("heading")).toHaveText("Game 3");
    await page.getByRole("button", { name: "Show all prices", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(8);
    background = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByRole("button", { name: "Manage Steam Wishlist updates", exact: true })
      .click();
    await expect(
      page.getByText("Steam is updating in the background", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Refresh prices", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    revision = "2";
    items[0].steamPrice.currentMinor = 200;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page
        .locator("article")
        .filter({
          has: page.getByRole("heading", { name: games[0].name, exact: true }),
        })
        .getByText("₪2.00", { exact: true }),
    ).toBeVisible();
    failReads = true;
    revision = "3";
    background = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText("Could not check for updates. Showing your saved Wishlist.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator("article")).toHaveCount(8);
    expect(mutations.filter((path) => /sync/.test(path))).toEqual([]);
    failReads = false;
    await page.screenshot({
      path: testInfo.outputPath(`wishlist-${label}.png`),
      fullPage: true,
    });
    await page.goto("/activity");
    await expect(
      page.getByRole("heading", { name: "Gaming activity", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Play history starts with your next sync", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Notifications/ })).toHaveCount(0);
    await page.goto("/wishlist");
    const notificationBell = page.getByRole("button", {
      name: /^Notifications/,
    });
    await notificationBell.click();
    const notifications = page.getByRole("dialog", {
      name: "Notifications",
      exact: true,
    });
    await expect(notifications).toBeVisible();
    await notifications
      .locator("summary")
      .filter({ hasText: "Wishlist sales" })
      .click();
    await expect(notifications.getByText(/New sale/)).toBeVisible();
    await notifications.getByRole("button", { name: "Mark read", exact: true }).click();
    await expect(
      notifications.getByRole("button", { name: "Mark read", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`notifications-${label}.png`),
      fullPage: true,
    });
    await notifications.getByRole("link", { name: "View details", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/wishlist");
    await notificationBell.click();
    await notifications
      .locator("summary")
      .filter({ hasText: "Wishlist sales" })
      .click();
    await notifications.getByRole("button", { name: "Hide update", exact: true }).click();
    await expect(
      notifications.getByText("Update hidden.", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/wishlist");
    await page.getByRole("button", { name: `Open details for ${games[0].name}`, exact: true }).click();
    await page.getByRole("button", { name: "Move to backlog", exact: true }).click();
    await expect.poll(() => mutations.includes("/api/wishlist/1/move-to-backlog")).toBe(true);
    await page.goto("/");
    const movedImage = page.locator("article").first().locator("img");
    await expect(movedImage).toHaveAttribute("src", items[0].cover);
    await expect(movedImage).toHaveCSS("object-fit", "cover");
    const moved = await measure();
    expect(Math.abs(moved.imageHeight - wishlist.imageHeight)).toBeLessThan(1);
    await page.screenshot({ path: testInfo.outputPath(`backlog-fallback-${label}.png`) });
    // Exercise the ultra-wide hero fallback (the Dawnwalker-shaped case).
    await page.route("https://cdn.akamai.steamstatic.com/**/library_hero.jpg", (route) => route.fulfill({
      contentType: process.env.ARTWORK_PREVIEW_DIR ? "image/jpeg" : "image/svg+xml",
      body: process.env.ARTWORK_PREVIEW_DIR
        ? readFileSync(join(process.env.ARTWORK_PREVIEW_DIR, "wishlist-3751260-hero.jpg"))
        : '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="620"><rect width="1920" height="620" fill="#936443"/></svg>',
    }));
    await page.reload();
    await expect(movedImage).toHaveAttribute("src", "https://cdn.akamai.steamstatic.com/steam/apps/3321460/library_hero.jpg");
    await expect(movedImage).toHaveCSS("object-fit", "cover");
    await page.screenshot({ path: testInfo.outputPath(`backlog-wide-${label}.png`) });
    await page.goto("/wishlist");
    await expect(page.locator("article").first().locator("img")).toHaveAttribute("src", "https://cdn.akamai.steamstatic.com/steam/apps/3321460/library_hero.jpg");
    await expect(page.locator("article").first().locator("img")).toHaveCSS("object-fit", "cover");
    await page.screenshot({ path: testInfo.outputPath(`wishlist-wide-${label}.png`) });
    expect(errors).toEqual([]);
  });
}
