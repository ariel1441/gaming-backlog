import { expect, test } from "@playwright/test";

async function installBaseSteamFixture(page, handleCandidateRead) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "steam-pagination-test");
    localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    const json = (body) => route.fulfill({ json: body });

    if (pathname === "/api/auth/me")
      return json({ id: 41, username: "steam-pages", preferences: {} });
    if (pathname === "/api/meta/status-groups")
      return json({ groups: { planned: ["plan to play"], playing: ["playing"], done: ["finished"], other: [] }, buckets: {} });
    if (pathname === "/api/games") return json([]);
    if (pathname === "/api/games/statuses-list")
      return json(["plan to play", "playing", "finished"]);
    if (pathname === "/api/personal-genres") return json({ genres: [] });
    if (pathname === "/api/steam/account")
      return json({ account: { id: 9, steamId: "76561198000000041", lastLibrarySyncAt: "2026-09-21T08:00:00Z" } });
    if (pathname === "/api/steam/sync-health")
      return json({ account: { id: 9, steamId: "76561198000000041", lastLibrarySyncAt: "2026-09-21T08:00:00Z" }, activeJob: null, runs: [], dailyRuns: [] });
    if (pathname === "/api/steam/duplicate-games") return json({ groups: [] });
    if (pathname === "/api/activity") return json({ events: [] });
    if (pathname === "/api/activity/inbox")
      return json({ snapshot: "0", nextCursor: null, counts: { pendingDecisions: 0 }, groups: [] });
    if (pathname === "/api/steam/import-candidates")
      return handleCandidateRead(route, url);
    return json({});
  });
}

function candidate(id, name) {
  return {
    id,
    steamAppId: String(100000 + id),
    steamName: name,
    importStatus: "pending",
    playtimeMinutes: 0,
    personalGenreSuggestions: [],
  };
}

function candidatePayload(candidates, { offset = 0, total = candidates.length } = {}) {
  return {
    candidates,
    summary: {
      total,
      ignored: 0,
      imported: 0,
      attached: 0,
      active: { total, groups: { needs_match: total } },
      state: { total, groups: { needs_match: total } },
    },
    page: { offset, limit: 100, total, hasMore: offset + candidates.length < total },
  };
}

test("Steam Library loads contiguous candidate pages", async ({ page }) => {
  const allCandidates = Array.from({ length: 250 }, (_, index) =>
    candidate(index + 1, `Steam app ${String(index + 1).padStart(3, "0")}`),
  );
  const offsets = [];
  await installBaseSteamFixture(page, (route, url) => {
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 100);
    offsets.push(offset);
    return route.fulfill({
      json: candidatePayload(allCandidates.slice(offset, offset + limit), {
        offset,
        total: allCandidates.length,
      }),
    });
  });

  await page.goto("/steam/library");
  await expect(page.getByText("Steam app 100", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Steam app 200", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Steam app 250", { exact: true })).toBeVisible();
  expect(offsets).toEqual([0, 100, 200]);
});

test("Steam Import ignores an older search response", async ({ page }) => {
  const searches = [];
  await installBaseSteamFixture(page, async (route, url) => {
    const query = url.searchParams.get("q") || "";
    searches.push(query);
    if (query === "slow") await new Promise((resolve) => setTimeout(resolve, 600));
    const name = query === "fast" ? "Fast current result" : query === "slow" ? "Slow stale result" : "Initial result";
    await route.fulfill({ json: candidatePayload([candidate(query === "fast" ? 3 : query === "slow" ? 2 : 1, name)], { total: 1 }) }).catch(() => {});
  });

  await page.goto("/steam/import?status=active&group=needs_match&sort=suggested");
  await expect(page.getByRole("heading", { name: "Initial result", exact: true })).toBeVisible();
  const search = page.getByPlaceholder("Find a Steam game...");
  await search.fill("slow");
  await expect.poll(() => searches.includes("slow")).toBe(true);
  await search.fill("fast");
  await expect(page.getByRole("heading", { name: "Fast current result", exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByRole("heading", { name: "Fast current result", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Slow stale result", exact: true })).toHaveCount(0);
});
