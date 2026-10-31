import { test, expect } from "@playwright/test";
import {
  FALLBACK_STATUS_GROUPS,
  SELECTABLE_STATUSES,
} from "../../shared/statusModel.js";

test("mobile navigation status v1 saves Played enough without a finish date and shows short Steam sessions", async ({
  page,
}) => {
  let games = [
    {
      id: 1,
      user_id: 7,
      name: "Enough experience",
      status: "playing",
      status_rank: 1,
      position: 1000,
      started_at: "2026-01-01",
      my_score: null,
    },
    {
      id: 2,
      user_id: 7,
      name: "Short trial",
      status: "played a bit",
      status_rank: 10,
      position: 1000,
      steamOwned: true,
      steamPlaytimeMinutes: 20,
      steamPlaytimeHours: 0.3,
      how_long_to_beat: 10,
    },
  ];
  let completion;
  await page.addInitScript(() => {
    localStorage.setItem("token", "status-v1-fixture");
    localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    let json = {};
    if (url.pathname === "/api/auth/me")
      json = { id: 7, username: "status-owner", preferences: {} };
    else if (url.pathname === "/api/meta/status-groups")
      json = FALLBACK_STATUS_GROUPS;
    else if (url.pathname === "/api/games/statuses-list")
      json = SELECTABLE_STATUSES;
    else if (url.pathname === "/api/games/1/finish" && method === "POST") {
      completion = route.request().postDataJSON();
      games = games.map((game) =>
        game.id === 1
          ? {
              ...game,
              status: completion.completion_status,
              my_score: completion.my_score,
              thoughts: completion.thoughts,
              finished_at: null,
            }
          : game,
      );
      json = { game: games[0], outcome: "completed" };
    } else if (url.pathname === "/api/games") json = games;
    else if (url.pathname === "/api/personal-genres") json = { genres: [] };
    else if (url.pathname === "/api/wishlist") json = [];
    else if (url.pathname === "/api/activity/inbox")
      json = { items: [], counts: {}, hasMore: false };
    await route.fulfill({ json });
  });
  await page.goto("/");
  await expect(
    page.getByText("Short trial", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Steam 20m", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Actions for Enough experience", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Finish game", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#finish-game-date")).toBeVisible();
  await dialog.getByText("Played enough", { exact: true }).click();
  await expect(
    dialog.getByRole("checkbox", { name: /^Played enough/ }),
  ).toBeChecked();
  await expect(dialog.locator("#finish-game-date")).toHaveCount(0);
  await dialog.getByLabel("My score").fill("7.5");
  await dialog
    .getByRole("button", { name: "Save status", exact: true })
    .click();
  await expect(
    dialog.getByText("Enough experience is now Played enough."),
  ).toBeVisible();
  expect(completion).toEqual({
    completion_status: "played alot but didnt finish",
    my_score: 7.5,
    thoughts: null,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
