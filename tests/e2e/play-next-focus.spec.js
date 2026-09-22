import { expect, test } from "@playwright/test";

const games = [
  {
    id: 1,
    name: "Long Story Main",
    status: "playing",
    my_genre: "RPG, Story focus",
    steamAppId: "101",
    resume_note: "Return to the northern gate.",
  },
  { id: 2, name: "Unclassified Active", status: "playing", my_genre: "Action" },
  { id: 3, name: "Friends Co-op", status: "playing", my_genre: "Co op" },
  {
    id: 4,
    name: "Run Based Candidate",
    status: "plan to play",
    my_genre: "Roguelike",
    how_long_to_beat: 99,
    displayHLTB: 12,
  },
  {
    id: 5,
    name: "Short Story Candidate",
    status: "plan to play",
    my_genre: "Indie, Story focus",
    how_long_to_beat: 5,
  },
  {
    id: 6,
    name: "Second Run Candidate",
    status: "plan to play",
    my_genre: "Roguelike",
    displayHLTB: 9,
  },
  {
    id: 7,
    name: "Return Later",
    status: "played and should come back",
    my_genre: "Action",
  },
];

async function fixture(page) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "play-next-focus");
    localStorage.setItem("seen_onboarding_v1", "1");
  });
  let nextUp = {
    gameIds: [5, 4],
    candidates: { main: [5], side: [4] },
    queue: [
      { gameId: 4, position: 0 },
      { gameId: 5, position: 1 },
    ],
    focus: { main: 1, side: null, occasional: [3] },
  };
  const mutations = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method !== "GET") mutations.push(`${method} ${url.pathname}`);
    let json = {};
    if (url.pathname === "/api/auth/me") json = { id: 7, username: "owner" };
    else if (url.pathname === "/api/meta/status-groups")
      json = {
        groups: {
          planned: ["plan to play"],
          playing: ["playing"],
          returning: ["played and should come back"],
          done: ["finished"],
          other: [],
        },
        buckets: {
          backlog: ["planned", "playing", "returning"],
          done: ["done"],
        },
      };
    else if (url.pathname === "/api/games/statuses-list")
      json = [
        "plan to play",
        "playing",
        "played and should come back",
        "finished",
      ];
    else if (url.pathname === "/api/personal-genres") json = { genres: [] };
    else if (url.pathname === "/api/games") json = games;
    else if (url.pathname === "/api/next-up" && method === "GET") json = nextUp;
    else if (url.pathname === "/api/next-up/focus/side" && method === "PUT") {
      nextUp = {
        ...nextUp,
        gameIds: [5],
        candidates: { main: [5], side: [] },
        focus: { ...nextUp.focus, side: 4 },
      };
      json = nextUp;
    } else if (url.pathname === "/api/next-up/focus/3" && method === "DELETE") {
      nextUp = {
        ...nextUp,
        focus: { ...nextUp.focus, occasional: [] },
      };
      json = { gameId: 3, focus: nextUp.focus };
    } else if (url.pathname === "/api/next-up/6/start" && method === "POST") {
      json = {
        game: { ...games.find((game) => game.id === 6), status: "playing" },
        gameIds: nextUp.gameIds,
      };
    }
    await route.fulfill({ json });
  });
  return mutations;
}

test("Play Next focuses two games while keeping extra active games secondary", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/next-up");

  await expect(page.getByRole("heading", { name: "Play Next" })).toBeVisible();
  await expect(
    page.getByText("Long Story Main", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Return to the northern gate.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Let’s play for 10 minutes" }),
  ).toBeVisible();
  await expect(page.getByText("Other active games (2)")).toBeVisible();
  await expect(
    page.getByText("Unclassified Active", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Candidate banks (2)")).toBeVisible();
  await expect(
    page.getByText("Run Based Candidate", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Choose Side" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose your side game" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("From your side candidates", { exact: true })).toBeVisible();
  await expect(dialog.getByText("From your backlog", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Candidate #1", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Strong Side fit", { exact: true }).first()).toBeVisible();
  const row = dialog.locator("div.rounded-xl", {
    hasText: "Run Based Candidate",
  });
  await row.getByRole("button", { name: "Choose" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Run Based Candidate", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Candidate banks (1)")).toBeVisible();
  await expect(
    page.getByText("Add a Next time note to make returning easier."),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "More actions for Run Based Candidate" })
    .click();
  await expect(page.getByRole("menuitem", { name: "Add Next time" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Other active games/ }).click();
  await expect(
    page.getByText("Unclassified Active", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Friends Co-op", { exact: true })).toBeVisible();
  await expect(page.getByText("Occasional", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Focus options for Friends Co-op" })
    .click();
  await page.getByRole("menuitem", { name: "Remove occasional" }).click();
  await expect(page.getByText("Occasional", { exact: true })).toHaveCount(0);
  const friendsRow = page.locator("article", { hasText: "Friends Co-op" });
  await expect(
    friendsRow.getByText("Active outside your focus slots", { exact: true }),
  ).toBeVisible();
});

test("mobile navigation keeps Play Next focused and usable", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/next-up");

  await expect(page.getByRole("heading", { name: "Play Next" })).toBeVisible();
  await expect(
    page.getByText("Long Story Main", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose Side" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Choose Side" }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose your side game" }),
  ).toBeVisible();
});

test("vibe suggestions advance in place and secondary sections start collapsed", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/next-up");

  await expect(page.getByRole("button", { name: "Come back (1)" })).toBeVisible();
  await expect(page.getByText("Return Later", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Choose a mood genre" }).click();
  await page.getByRole("option", { name: "Roguelike" }).click();
  await expect(page.getByText("Run Based Candidate", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Show another" }).click();
  await expect(page.getByText("Second Run Candidate", { exact: true })).toBeVisible();
  await expect(page.getByText("Run Based Candidate", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Pick for me" }).click();
  await expect(page.getByText("Picked for you", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Show candidates" }).click();
  const shortlist = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Candidate banks (2)" }),
  });
  await expect(
    shortlist.getByText("Run Based Candidate", { exact: true }),
  ).toBeVisible();
  await expect(
    shortlist.getByText("Short Story Candidate", { exact: true }),
  ).toBeVisible();
});

test("starting a backlog vibe suggestion does not add it to the shortlist first", async ({
  page,
}) => {
  const mutations = await fixture(page);
  await page.goto("/next-up");

  await page.getByRole("button", { name: "Choose a mood genre" }).click();
  await page.getByRole("option", { name: "Roguelike" }).click();
  await page.getByRole("button", { name: "Show another" }).click();
  await expect(page.getByText("Second Run Candidate", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start playing" }).click();
  await page.getByRole("button", { name: "Start playing", exact: true }).last().click();

  await expect.poll(() => mutations).toContain("POST /api/next-up/6/start");
  expect(mutations).not.toContain("POST /api/next-up/6");
});
