import { expect, test } from "@playwright/test";

test("changing a chosen backlog status keeps a Steam review candidate in its suggested lane", async ({
  page,
}) => {
  let candidateReads = 0;
  let gamesReads = 0;
  let imported = false;
  const candidate = {
    id: 1,
    steamName: "Stable review game",
    steamAppId: "123",
    importStatus: "pending",
    proposedCatalogGameId: 99,
    proposedCatalogName: "Stable review game",
    suggestedStatus: "plan to play",
    selectedStatus: null,
    playtimeMinutes: 0,
    personalGenreSuggestions: [{ id: 7, name: "Action", reason: "RAWG genre match" }],
  };

  await page.addInitScript(() => {
    localStorage.setItem("token", "steam-review-test");
    localStorage.setItem("seen_onboarding_v1", "1");
    localStorage.setItem("gaming_backlog_sidebar_collapsed_v1", "0");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();
    const json = (body) => route.fulfill({ json: body });

    if (pathname === "/api/auth/me")
      return json({ id: 1, username: "steam-review", preferences: {} });
    if (pathname === "/api/games") {
      gamesReads += 1;
      return json(
        imported
          ? [{ id: 42, name: "Stable review game", status: "playing" }]
          : [],
      );
    }
    if (pathname === "/api/games/statuses-list")
      return json(["plan to play", "playing", "finished"]);
    if (pathname === "/api/personal-genres")
      return json({ genres: [{ id: 7, name: "Action" }, { id: 8, name: "Cozy" }] });
    if (pathname === "/api/meta/status-groups")
      return json({
        groups: {
          planned: ["plan to play"],
          playing: ["playing"],
          done: ["finished"],
          other: [],
        },
        buckets: {},
      });
    if (pathname === "/api/steam/account") return json({ account: null });
    if (pathname === "/api/activity") return json({ events: [] });
    if (pathname === "/api/activity/inbox")
      return json({ items: [], counts: {}, hasMore: false });
    if (pathname === "/api/steam/import-candidates" && method === "GET") {
      candidateReads += 1;
      expect(url.searchParams.get("group")).toBe("unplayed");
      return json({
        candidates: imported ? [] : [candidate],
        summary: {
          ignored: 0,
          imported: imported ? 1 : 0,
          attached: 0,
          active: { total: imported ? 0 : 1, groups: { unplayed: imported ? 0 : 1 } },
          state: { total: imported ? 0 : 1, groups: { unplayed: imported ? 0 : 1 } },
        },
        page: { offset: 0, limit: 100, total: imported ? 0 : 1, hasMore: false },
      });
    }
    if (
      pathname === "/api/steam/import-candidates/1" &&
      method === "PATCH"
    ) {
      expect(route.request().postDataJSON()).toEqual({
        action: "set_status",
        status: "playing",
      });
      return json({ id: 1, selectedStatus: "playing" });
    }
    if (pathname === "/api/steam/import" && method === "POST") {
      expect(route.request().postDataJSON()).toEqual({
        candidateIds: [1],
        candidateReviews: [{ candidateId: 1, personalGenreIds: [7] }],
      });
      imported = true;
      return json({ imported: [{ candidateId: 1, gameId: 42 }], attached: [], skipped: [] });
    }
    return json({});
  });

  await page.goto("/steam/import?status=active&group=unplayed&sort=suggested");
  const candidateHeading = page.getByRole("heading", {
    name: "Stable review game",
    exact: true,
  });
  await expect(candidateHeading).toBeVisible();
  const readsBeforeChange = candidateReads;

  await page.locator("#steam-candidate-status-1").click();
  await page.getByRole("option", { name: "playing", exact: true }).click();

  await expect(candidateHeading).toBeVisible();
  await expect(page.locator("#steam-candidate-status-1")).toHaveText("playing");
  await page.waitForTimeout(100);
  expect(candidateReads).toBe(readsBeforeChange);

  await expect(page.getByText("0 of 1 visible selected")).toBeVisible();
  await page.getByRole("button", { name: "Select all 1 visible" }).first().click();
  await expect(page.getByText("1 of 1 visible selected")).toBeVisible();
  const readsBeforeImport = gamesReads;
  await page.getByRole("button", { name: "Add selected to Backlog" }).click();
  await expect.poll(() => gamesReads).toBeGreaterThan(readsBeforeImport);
});
