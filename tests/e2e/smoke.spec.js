import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:5000";

const statusGroups = {
  groups: {
    planned: ["plan to play soon", "plan to play"],
    playing: ["playing", "played and should come back"],
    done: ["finished", "played alot but didnt finish"],
    other: [],
  },
  buckets: {
    backlog: ["planned", "playing", "other"],
    done: ["done"],
  },
};

const games = [
  {
    id: 1,
    user_id: 99,
    name: "Baldur's Gate 3",
    status: "playing",
    status_rank: 1,
    position: 1000,
    my_genre: "RPG",
    genres: "RPG, Adventure",
    how_long_to_beat: 70,
    my_score: 9,
    started_at: "2026-01-10",
    finished_at: null,
    cover: "",
  },
  {
    id: 2,
    user_id: 99,
    name: "Clair Obscur: Expedition 33",
    status: "finished",
    status_rank: 12,
    position: 1000,
    my_genre: "RPG",
    genres: "RPG",
    how_long_to_beat: 25,
    my_score: 10,
    started_at: "2026-03-01",
    finished_at: "2026-04-02",
    cover: "",
  },
  {
    id: 3,
    user_id: 99,
    name: "Returnal",
    status: "played and should come back",
    status_rank: 4,
    position: 1000,
    my_genre: "Action",
    genres: "Action",
    how_long_to_beat: 21,
    my_score: 8,
    started_at: "2025-01-01",
    finished_at: null,
    cover: "",
  },
];

const insights = {
  totals: {
    count: 3,
    hours_playing: 91,
    hours_planned: 0,
    hours_done: 25,
    total_hours: 116,
    remaining_hours: 91,
    avg_hours: 38.7,
    total_games_counted: 3,
  },
  byStatus: [
    { status: "playing", rank: 1, count: 1, hours: 70 },
    { status: "played and should come back", rank: 4, count: 1, hours: 21 },
    { status: "finished", rank: 12, count: 1, hours: 25 },
  ],
  eta: {
    remaining_hours: 91,
    weekly_hours: 10,
    weeks: 9.1,
    finish_date: "2026-07-15",
  },
  meta: {
    missing_names: [],
    sources: { db: 3, hltb: 0, rawg: 0 },
  },
};

async function mockApi(page) {
  let serverGames = games.map((game) => ({ ...game }));
  const rankForStatus = (status) =>
    status === "finished"
      ? 12
      : status === "played and should come back"
        ? 4
        : status === "plan to play soon"
          ? 2
          : 1;

  await page.route(`${API_BASE}/api/meta/status-groups`, (route) =>
    route.fulfill({ json: statusGroups })
  );
  await page.route(`${API_BASE}/api/demo/start`, (route) =>
    route.fulfill({
      json: {
        token: "demo-token",
        user: {
          id: 99,
          username: "demo_guest",
          is_guest: true,
          is_public: false,
        },
      },
    })
  );
  await page.route(`${API_BASE}/api/demo/discard`, (route) =>
    route.fulfill({ json: { ok: true } })
  );
  await page.route(`${API_BASE}/api/demo/heartbeat`, (route) =>
    route.fulfill({ json: { ok: true } })
  );
  await page.route(`${API_BASE}/api/auth/me`, (route) =>
    route.fulfill({
      json: {
        id: 99,
        username: "e2e_user",
        is_guest: false,
        is_public: false,
      },
    })
  );
  await page.route(`${API_BASE}/api/games/statuses-list`, (route) =>
    route.fulfill({
      json: [
        "playing",
        "plan to play soon",
        "played and should come back",
        "finished",
      ],
    })
  );
  await page.route(`${API_BASE}/api/games/search**`, (route) =>
    route.fulfill({
      json: {
        results: [
          {
            rawg_id: 42,
            rawg_slug: "hollow-knight",
            name: "Hollow Knight",
            released: "2017-02-24",
            rating: 4.4,
            metacritic: 87,
            cover: "",
          },
        ],
      },
    })
  );
  await page.route(`${API_BASE}/api/games`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          json: (() => {
            const body = route.request().postDataJSON();
            const created = {
              id: 100,
              user_id: 99,
              position: 2000,
              my_genre: "",
              genres: "",
              cover: "",
              ...body,
              status_rank: rankForStatus(body.status),
            };
            serverGames = [...serverGames, created];
            return created;
          })(),
        })
      : route.fulfill({ json: serverGames })
  );
  await page.route(new RegExp(`${API_BASE}/api/games/\\d+$`), (route) => {
    const id = Number(route.request().url().split("/").pop());
    const method = route.request().method();

    if (method === "PUT") {
      const body = route.request().postDataJSON();
      const current = serverGames.find((game) => game.id === id);
      const updated = {
        ...current,
        ...body,
        id,
        user_id: 99,
        status_rank: rankForStatus(body.status || current?.status),
      };
      serverGames = serverGames.map((game) => (game.id === id ? updated : game));
      return route.fulfill({ json: updated });
    }

    if (method === "DELETE") {
      serverGames = serverGames.filter((game) => game.id !== id);
      return route.fulfill({ json: { ok: true } });
    }

    return route.fulfill({ json: serverGames.find((game) => game.id === id) });
  });
  await page.route(`${API_BASE}/api/games/*/position`, (route) =>
    route.fulfill({ json: { game: serverGames[0], rank_order: [] } })
  );
  await page.route(`${API_BASE}/api/insights**`, (route) =>
    route.fulfill({ json: insights })
  );
  await page.route(`${API_BASE}/api/public/ariel1441`, (route) =>
    route.fulfill({
      json: {
        username: "ariel1441",
        is_public: true,
        joined_at: "2025-08-09T00:00:00.000Z",
        game_count: games.length,
      },
    })
  );
  await page.route(`${API_BASE}/api/public/ariel1441/games`, (route) =>
    route.fulfill({ json: games })
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("starts the demo and renders the backlog", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Welcome to Gaming Backlog" }))
    .toBeVisible();
  await page.getByRole("button", { name: /try the full demo/i }).click();

  await expect(page.getByText("Baldur's Gate 3")).toBeVisible();
});

test("renders a public profile as read-only", async ({ page }) => {
  await page.goto("/u/ariel1441", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "@ariel1441" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Favorite games" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Currently playing" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recently finished" })).toBeVisible();
  await expect(page.getByText("Favorite slot").first()).toBeVisible();
  await page.getByRole("button", { name: "View all games" }).click();
  await expect(page).toHaveURL(/view=games/);
  await expect(
    page.getByRole("heading", { name: "Clair Obscur: Expedition 33" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /add game/i })).toHaveCount(0);
});

test("links from insights active stats back to filtered backlog", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/insights", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /Insights/i })).toBeVisible();
  await page.getByRole("button", { name: /Currently active/i }).click();

  await expect(page).toHaveURL(/active=unfinished/);
  await expect(page.getByText("Baldur's Gate 3")).toBeVisible();
  await expect(page.getByText("Clair Obscur: Expedition 33")).toHaveCount(0);
});

test("adds, edits, and deletes a game in the backlog", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: /add game/i }).click();
  await expect(page.getByRole("heading", { name: "Add New Game" })).toBeVisible();
  await page.getByLabel("Name").fill("Hollow Knight");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "plan to play soon" }).click();
  await page.getByLabel("HLTB hours").fill("27");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add Game", exact: true })
    .click();

  const addedCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Hollow Knight" }),
  });
  await expect(addedCard).toBeVisible();

  await addedCard.getByLabel("Edit game").click();
  await expect(page.getByRole("heading", { name: "Edit Game" })).toBeVisible();
  await page.getByLabel("My score").fill("9");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Game updated.")).toBeVisible();

  await addedCard.getByLabel("Delete game").click();
  await expect(page.getByRole("heading", { name: "Delete game?" })).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Hollow Knight" })).toHaveCount(0);
});
