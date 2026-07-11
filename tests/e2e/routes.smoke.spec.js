import { expect, test } from "@playwright/test";

const routes = [
  ["/discover", "Discover"],
  ["/lists", "Lists"],
  ["/lists/1", "List"],
  ["/timeline", "Timeline"],
  ["/reviews", "Reviews"],
  ["/insights", "Insights"],
  ["/steam/library", "Steam Library"],
  ["/steam/import", "Steam Review"],
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
      page.getByRole("heading", { name: expectedHeading, exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
}
