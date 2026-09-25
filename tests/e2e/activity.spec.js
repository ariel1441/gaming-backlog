import { test, expect } from "@playwright/test";

const landscapeCover = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%23233b63'/%3E%3C/svg%3E";

const feed = {
  range: "7d",
  timezone: "Asia/Jerusalem",
  summary: { playtimeMinutes: 275, overlappingPlaytimeMinutes: 0, gamesPlayed: 2, achievementsUnlocked: 5 },
  coverage: {
    status: "partial", reliableDays: 4, expectedCloseouts: 6, missingCloseouts: 2,
    trailingMissingCloseouts: 1, uncertainIntervals: 1, latestSnapshotAt: "2026-09-24T02:00:00.000Z",
  },
  items: [
    {
      type: "day", key: "day:2026-09-23", date: "2026-09-23",
      playtimeMinutes: 90, gameCount: 1,
      games: [{
        steamAppId: "20", gameId: 5,
        name: "A Very Long Game Title That Must Stay Readable On A Narrow Mobile Screen",
        cover: landscapeCover, playtimeMinutes: 90,
        highlights: [{ type: "first_played" }, { type: "added_to_library" }],
        achievements: [
          { id: 1, name: "First step" }, { id: 2, name: "Second step" },
          { id: 3, name: "Third step" }, { id: 4, name: "Fourth step" },
          { id: 5, name: "Fifth step" },
        ],
      }],
    },
    {
      type: "uncertain", key: "interval:1", startDay: "2026-09-19", endDay: "2026-09-22",
      intervalStartedAt: "2026-09-19T02:00:00.000Z", intervalEndedAt: "2026-09-22T02:00:00.000Z",
      playtimeMinutes: 185, gameCount: 1,
      games: [{
        steamAppId: "10", name: "Hades", cover: null, playtimeMinutes: 185,
        highlights: [{ type: "returned", daysSincePrevious: 46 }], achievements: [],
        allocationSources: [{
          observationId: 42, revision: 0, totalMinutes: 185,
          startDay: "2026-09-19", endDay: "2026-09-22",
          eligibleDays: ["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"],
          allocations: [],
        }],
      }],
    },
  ],
};

const insightsFeed = {
  range: "week",
  timezone: "Asia/Jerusalem",
  period: {
    range: "week", label: "This week", startDay: "2026-09-21", endDay: "2026-09-27",
    throughDay: "2026-09-24", isIncomplete: true,
  },
  summary: {
    playtimeMinutes: 275, reliablePlaytimeMinutes: 90, uncertainPlaytimeMinutes: 185,
    unallocatedPlaytimeMinutes: 45, gamesPlayed: 2, achievementsUnlocked: 2,
    preciseActiveDays: 1, preciseDailyAverageMinutes: 90,
  },
  coverage: {
    status: "partial", reliableDays: 3, uncertainIntervals: 1,
    trailingMissingCloseouts: 1,
    latestSnapshotAt: "2026-09-24T02:00:00.000Z", reliableCoverageSufficient: false,
    patternClaimsAvailable: false,
  },
  mostPlayed: [
    { steamAppId: "10", name: "Hades", cover: null, playtimeMinutes: 185, reliablePlaytimeMinutes: 0, uncertainPlaytimeMinutes: 185 },
    { steamAppId: "20", gameId: 5, name: "A Very Long Game Title That Must Stay Readable On A Narrow Mobile Screen", cover: landscapeCover, playtimeMinutes: 90, reliablePlaytimeMinutes: 90, uncertainPlaytimeMinutes: 0 },
  ],
  firstObservedPlays: [{ steamAppId: "20", name: "Long first play title", activityDay: "2026-09-21" }],
  reliableReturns: [{ steamAppId: "10", name: "Hades", activityDay: "2026-09-21", daysSincePrevious: 46 }],
  dailyBars: [
    {
      day: "2026-09-21", playtimeMinutes: 90, achievementsUnlocked: 1,
      games: [{ steamAppId: "20", gameId: 5, name: "A Very Long Game Title That Must Stay Readable On A Narrow Mobile Screen", cover: landscapeCover, playtimeMinutes: 90, achievementsUnlocked: 1 }],
    },
    { day: "2026-09-22", playtimeMinutes: 0, achievementsUnlocked: 1, games: [{ steamAppId: "10", name: "Hades", cover: null, playtimeMinutes: 0, achievementsUnlocked: 1 }] },
  ],
  uncertainIntervals: [{ key: "inside", startDay: "2026-09-22", endDay: "2026-09-24", playtimeMinutes: 185 }],
  unallocatedOverlap: {
    playtimeMinutes: 45,
    intervals: [{ key: "crossing", startDay: "2026-09-19", endDay: "2026-09-21", playtimeMinutes: 45 }],
    games: [{ steamAppId: "30", name: "Crossing", playtimeMinutes: 45 }],
  },
};

async function authenticatedActivity(
  page,
  activityHandler,
  user = { id: 99, username: "activity-owner" },
  insightsHandler = (route) => route.fulfill({ json: insightsFeed }),
) {
  await page.addInitScript(() => localStorage.setItem("token", "activity-token"));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: user });
    if (url.pathname === "/api/meta/status-groups") {
      return route.fulfill({ json: { groups: { planned: [], playing: [], done: [], other: [] }, buckets: {} } });
    }
    if (url.pathname === "/api/games") {
      return route.fulfill({ json: [{
        id: 5,
        name: "A Very Long Game Title That Must Stay Readable On A Narrow Mobile Screen",
        status: "playing",
        position: 1000,
        cover: null,
      }] });
    }
    if (url.pathname === "/api/activity/play-history" || url.pathname.startsWith("/api/activity/play-history/")) {
      return activityHandler(route, url);
    }
    if (url.pathname === "/api/activity/insights") return insightsHandler(route, url);
    return route.fulfill({ json: {} });
  });
}

test("activity feed covers loading, ranges, highlights, achievements and responsive intervals", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let requests = 0;
  let savedAllocation = null;
  let resetRevision = null;
  await authenticatedActivity(page, async (route, url) => {
    if (route.request().method() === "PUT") {
      savedAllocation = route.request().postDataJSON();
      return route.fulfill({ json: { observationId: 42, revision: 1 } });
    }
    if (route.request().method() === "DELETE") {
      resetRevision = url.searchParams.get("expectedRevision");
      savedAllocation = null;
      return route.fulfill({ json: { observationId: 42, revision: 2, allocations: [] } });
    }
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const range = url.searchParams.get("range");
    if (range === "30d") {
      return route.fulfill({ json: {
        ...feed, range, summary: {},
        coverage: { status: "complete", reliableDays: 30, expectedCloseouts: 30 }, items: [],
      } });
    }
    const payload = savedAllocation ? {
      ...feed,
      range,
      items: feed.items.map((item) => item.type !== "uncertain" ? item : ({
        ...item,
        games: item.games.map((game) => ({
          ...game,
          allocatedPlaytimeMinutes: 185,
          allocationSources: game.allocationSources.map((source) => ({
            ...source,
            revision: 1,
            allocations: [{ activityDay: "2026-09-20", minutes: 185 }],
          })),
        })),
      })),
    } : { ...feed, range };
    return route.fulfill({ json: payload });
  });

  await page.goto("/activity");
  await expect(page.getByRole("status", { name: "Loading", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gaming activity", exact: true })).toBeVisible();
  await expect(page.getByText("4 of 6 reliable", { exact: true })).toBeVisible();
  await expect(page.getByText(/1 expected closeout is still missing/)).toBeVisible();
  await expect(page.getByText("First played", { exact: true })).toBeVisible();
  await expect(page.getByText("Added to Steam library", { exact: true })).toBeVisible();
  await expect(page.getByText("Returned after 46 days", { exact: true })).toBeVisible();
  await expect(page.getByText("5 achievements:")).toBeVisible();
  await expect(page.getByText("Show 2 more", { exact: true })).toBeVisible();
  await expect(page.getByText("Timing uncertain", { exact: true })).toBeVisible();
  await expect(page.getByText("3h 5m played", { exact: true })).toBeVisible();
  const activityCover = page.getByAltText("A Very Long Game Title That Must Stay Readable On A Narrow Mobile Screen cover");
  await expect(activityCover).toBeVisible();
  expect((await activityCover.boundingBox()).width).toBeGreaterThan(120);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole("button", { name: "Choose dates", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Choose activity dates" })).toBeVisible();
  await page.getByRole("button", { name: "Assign all playtime to Sunday, Sep 20" }).click();
  await expect(page.getByText("All playtime assigned", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save dates", exact: true }).click();
  await expect(page.getByText("Activity dates saved.", { exact: true })).toBeVisible();
  expect(savedAllocation).toEqual({
    expectedRevision: 0,
    allocations: [{ activityDay: "2026-09-20", minutes: 185 }],
  });

  await page.getByRole("button", { name: "Edit dates", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reset chosen dates?" })).toBeVisible();
  await page.getByRole("button", { name: "Reset dates", exact: true }).click();
  await expect(page.getByText("Chosen dates reset.", { exact: true })).toBeVisible();
  expect(resetRevision).toBe("1");

  await page.getByRole("button", { name: "Open details for A Very Long Game Title That Must Stay Readable On A Narrow Mobile Screen" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "A Very Long Game Title That Must Stay Readable On A Narrow Mobile Screen" })).toBeVisible();
  await page.getByRole("button", { name: "Close game details" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "30 days", exact: true }).click();
  await expect(page.getByText("No activity in this range", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByText("Returned after 46 days", { exact: true })).toBeVisible();
  expect(requests).toBe(5);
});

test("activity feed exposes a retryable read error", async ({ page }) => {
  await authenticatedActivity(page, (route) => route.fulfill({
    status: 400, json: { error: { code: "bad_request", message: "Activity read failed" } },
  }));
  await page.goto("/activity");
  await expect(page.getByRole("heading", { name: "Could not load gaming activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("activity insights cover ranges, uncertainty, exact days and responsive states", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const insightRequests = [];
  await authenticatedActivity(
    page,
    (route) => route.fulfill({ json: feed }),
    { id: 99, username: "activity-owner" },
    async (route, url) => {
      const range = url.searchParams.get("range");
      insightRequests.push(range);
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (range === "month") {
        return route.fulfill({ json: {
          ...insightsFeed, range, period: { ...insightsFeed.period, range, label: "This month" },
          summary: { playtimeMinutes: 0, achievementsUnlocked: 0 }, mostPlayed: [],
          firstObservedPlays: [], reliableReturns: [], dailyBars: [],
          coverage: { status: "complete", reliableDays: 12, uncertainIntervals: 0, patternClaimsAvailable: true },
          unallocatedOverlap: { playtimeMinutes: 0, intervals: [], games: [] },
        } });
      }
      return route.fulfill({ json: {
        ...insightsFeed, range,
        period: { ...insightsFeed.period, range, label: range === "year" ? "2026" : range === "all" ? "All observed activity" : "This week" },
      } });
    },
  );
  await page.goto("/activity");
  await expect(page.getByRole("button", { name: "Insights", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(page.getByRole("status", { name: "Loading", exact: true })).toBeVisible();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
  await expect(page.getByText("3h 5m has uncertain timing.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outside this range" })).toBeVisible();
  await expect(page.getByText("No playtime · 1 🏆", { exact: true })).toBeVisible();
  await expect(page.getByText("Hades after 46 days", { exact: true })).toBeVisible();
  await expect(page.getByText("The latest activity check is still pending.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Monday, Sep 21: 1h 30m, 1 achievements/ }).click();
  await expect(page.getByRole("heading", { name: "Monday, Sep 21", exact: true })).toBeVisible();
  await expect(page.getByText("1h 30m · 1 achievement", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole("button", { name: "This month", exact: true }).click();
  await expect(page.getByText("No insights in this range", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "This year", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recap highlights" })).toBeVisible();
  await page.getByRole("button", { name: "All time", exact: true }).click();
  await expect(page.getByText("All observed activity", { exact: true })).toBeVisible();
  expect(insightRequests).toEqual(["week", "month", "year", "all"]);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("heading", { name: "Most played" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("activity insights expose a retryable read error", async ({ page }) => {
  await authenticatedActivity(
    page,
    (route) => route.fulfill({ json: feed }),
    { id: 99, username: "activity-owner" },
    (route) => route.fulfill({
      status: 400, json: { error: { code: "bad_request", message: "Insights read failed" } },
    }),
  );
  await page.goto("/activity");
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Could not load activity insights" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("demo activity stays private without calling the feed API", async ({ page }) => {
  let feedRequested = false;
  await authenticatedActivity(page, (route) => {
    feedRequested = true;
    return route.fulfill({ json: feed });
  }, { id: 88, username: "demo", is_guest: true });
  await page.goto("/activity");
  await expect(page.getByText("Gaming activity is private", { exact: true })).toBeVisible();
  expect(feedRequested).toBe(false);
});
