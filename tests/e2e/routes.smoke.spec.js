import { expect, test } from "@playwright/test";

const routes = [
  ["/discover", "Discover"],
  ["/lists", "Lists"],
  ["/lists/1", "List"],
  ["/timeline", "Timeline"],
  ["/reviews", "Reviews"],
  ["/insights", "Insights"],
  ["/steam/library", "Steam Library"],
  ["/steam/import", "Steam Import Review"],
  ["/wishlist", /wishlist$/i],
  ["/me", "@smoke_user"],
  ["/settings", "Settings"],
];

async function fulfillSmokeApi(route) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const json = (body) => route.fulfill({ json: body });

  if (path === "/api/auth/me")
    return json({ id: 99, username: "smoke_user", is_public: false });
  if (path === "/api/meta/status-groups")
    return json({
      groups: { planned: [], playing: [], done: [], other: [] },
      buckets: {},
    });
  if (path === "/api/games") return json([]);
  if (path === "/api/metadata/repair-jobs/latest") return json({
    job: null,
    refresh: { enabled: false, providerConfigured: true, intervalDays: 7,
      trackedCount: 12, dueCount: 3, failedCount: 1, lastMetadataUpdateAt: "2026-09-10T10:00:00.000Z" },
  });
  if (path === "/api/games/statuses-list") return json([]);
  if (path === "/api/lists") return json([]);
  if (path === "/api/lists/1")
    return json({ id: 1, name: "Smoke Test List", type: "manual", games: [] });
  if (path.startsWith("/api/catalog"))
    return json({
      results: [
        {
          id: 501,
          name: "Smoke Test Game",
          genres: ["Action"],
          cacheStatus: "fresh",
          alreadyInBacklog: false,
        },
      ],
      shelves: [],
      facets: { genres: [] },
      total: 0,
      totalPages: 1,
    });
  if (path === "/api/steam/account") return json({ account: null });
  if (path === "/api/wishlist")
    return json({
      account: {
        steamId: "76561190000000000",
        wishlistSyncStatus: "synced",
        lastWishlistSyncAt: "2026-09-04T00:00:00.000Z",
      },
      items: [
        {
          id: 1,
          steamAppId: "10",
          name: "A Very Long Wishlist Game Title That Must Remain Readable on Mobile",
          cover: null,
          genres: ["Adventure", "RPG"],
          displayHLTB: 24,
          rating: 4.4,
          metacritic: 86,
          releaseDate: "2026-08-01",
          priority: 0,
          dateAdded: "2026-08-01T00:00:00.000Z",
          steamActive: true,
          active: true,
        },
      ],
      total: 1,
      metadata: { missingNames: 0, complete: true },
    });
  if (path.startsWith("/api/steam/import"))
    return json({
      results: [],
      candidates: [],
      groups: {},
      summary: {},
      total: 0,
    });
  if (path.startsWith("/api/insights"))
    return json({
      totals: {},
      byStatus: [],
      eta: {},
      meta: { missing_names: [], sources: {} },
    });
  return json({});
}

for (const [route, expectedHeading] of routes) {
  test(`${route} renders without an uncaught runtime error`, async ({
    page,
  }) => {
    const runtimeErrors = [];
    page.on("pageerror", (error) =>
      runtimeErrors.push(error.stack || error.message),
    );
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });

    await page.addInitScript(() => {
      window.localStorage.setItem("token", "smoke-token");
      window.localStorage.setItem("seen_onboarding_v1", "1");
    });

    await page.route("**/api/**", fulfillSmokeApi);

    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(750);

    expect(runtimeErrors, `Uncaught errors while rendering ${route}`).toEqual(
      [],
    );

    await expect(
      page.getByRole("heading", {
        name: "This page could not be displayed",
      }),
    ).toHaveCount(0);

    await expect(
      page.getByRole("heading", {
        name: expectedHeading,
        exact: typeof expectedHeading === "string",
      }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
}

test("wishlist mobile layout handles long titles without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "smoke-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route("**/api/**", fulfillSmokeApi);
  await page.goto("/wishlist", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/A Very Long Wishlist Game Title/)).toBeVisible();
  await expect(page.getByText("Wishlist", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("24h", { exact: true })).toBeVisible();
  await expect(page.getByText("Adventure", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("settings game metadata controls render responsively", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", (error) =>
    runtimeErrors.push(error.stack || error.message),
  );
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("token", "smoke-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route("**/api/**", fulfillSmokeApi);

  await page.goto("/settings?section=metadata", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("heading", { name: "Game metadata", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("title matches always wait for review", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Repair missing metadata" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Review matches" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly metadata refresh" })).toBeVisible();
  await expect(page.getByText("Automatic refresh is currently disabled on this server.")).toBeVisible();
  await expect(page.getByText("3 due for refresh", { exact: true })).toBeVisible();
  await expect(page.getByText(/Most recent metadata update for your games:/)).toBeVisible();

  expect(runtimeErrors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("settings game metadata explains enabled refresh without provider configuration", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "smoke-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === '/api/metadata/repair-jobs/latest') {
      return route.fulfill({ json: { job: null, refresh: { enabled: true, providerConfigured: false,
        trackedCount: 0, dueCount: 0, failedCount: 0, lastMetadataUpdateAt: null } } });
    }
    return fulfillSmokeApi(route);
  });
  await page.goto('/settings?section=metadata');
  await expect(page.getByText('Refresh is enabled, but RAWG is not configured on this server.')).toBeVisible();
  await expect(page.getByText(/No successful update recorded/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("settings game metadata batch review stays open and advances", async ({
  page,
}) => {
  const accepted = [];
  let candidates = [
    {
      id: 1,
      gameId: 10,
      gameName: "Hades",
      candidateName: "Hades",
      confidenceLevel: "high",
      candidateRank: 1,
    },
    {
      id: 2,
      gameId: 10,
      gameName: "Hades",
      candidateName: "Hades II",
      confidenceLevel: "medium",
      candidateRank: 2,
    },
    {
      id: 3,
      gameId: 11,
      gameName: "Celeste",
      candidateName: "Celeste",
      confidenceLevel: "high",
      candidateRank: 1,
    },
    ...Array.from({ length: 49 }, (_, index) => ({
      id: 100 + index,
      gameId: 1000 + index,
      gameName: `Extra Game ${index + 1}`,
      candidateName: `Extra Game ${index + 1}`,
      confidenceLevel: "high",
      candidateRank: 1,
    })),
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem("token", "smoke-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/metadata/repair-jobs/latest") {
      const gameCount = new Set(candidates.map((candidate) => candidate.gameId)).size;
      return route.fulfill({
        json: {
          job: {
            id: 7,
            status: "completed",
            totalCount: 2,
            processedCount: 2,
            linkedCount: 0,
            reviewCount: 2,
            unmatchedCount: 0,
            failedCount: 0,
          },
          pendingCandidateCount: candidates.length,
          pendingReviewGameCount: gameCount,
        },
      });
    }
    if (url.pathname === "/api/metadata/candidates") {
      return route.fulfill({ json: { candidates } });
    }
    if (
      route.request().method() === "PATCH" &&
      url.pathname.startsWith("/api/metadata/candidates/")
    ) {
      const id = Number(url.pathname.split("/").pop());
      const selected = candidates.find((candidate) => candidate.id === id);
      accepted.push(id);
      candidates = candidates.filter(
        (candidate) => candidate.gameId !== selected.gameId,
      );
      return route.fulfill({ json: { candidate: { ...selected, decision: "accepted" } } });
    }
    return fulfillSmokeApi(route);
  });

  await page.goto("/settings?section=metadata", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("51 games to review")).toBeVisible();
  await expect(page.getByText("52 suggestions across 51 backlog games")).toBeVisible();

  await page.getByRole("button", { name: /Review matches/ }).click();
  await expect(page.getByText("51 backlog games", { exact: true })).toBeVisible();
  const toolbar = page.getByRole("toolbar", { name: "Batch review controls" });
  await expect(toolbar).toBeVisible();
  await page.getByRole("button", { name: "Select first high matches" }).click();
  await expect(page.getByRole("button", { name: "Apply selected (50)" })).toBeVisible();
  const lastGroup = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Extra Game 49", exact: true }),
  });
  await lastGroup.getByText("Add to batch", { exact: true }).click();
  await expect(page.getByText("Choose up to 50 games per batch.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review metadata matches" })).toBeVisible();
  await expect(toolbar).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  const hadesGroup = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Hades", exact: true }),
  });
  const celesteGroup = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Celeste", exact: true }),
  });
  await hadesGroup.getByText("Add to batch", { exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Review metadata matches" })).toBeVisible();
  await celesteGroup.getByText("Add to batch", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review metadata matches" })).toBeVisible();
  await page.getByRole("button", { name: "Apply selected (2)" }).click();

  await expect(
    page.getByRole("heading", { name: "Review metadata matches" }),
  ).toBeVisible();
  await expect(page.getByText("49 backlog games", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply selected (0)" })).toBeDisabled();
  await expect(hadesGroup).toHaveCount(0);
  await expect(celesteGroup).toHaveCount(0);
  expect(accepted).toEqual([1, 3]);
});
