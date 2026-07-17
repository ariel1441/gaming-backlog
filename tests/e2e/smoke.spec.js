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
    thoughts: "A wonderfully reactive role-playing adventure.",
    started_at: "2026-01-10",
    finished_at: null,
    cover: "",
    favorite_rank: 1,
  },
  {
    id: 4,
    user_id: 99,
    name: "Disco Elysium",
    status: "playing",
    status_rank: 1,
    position: 2000,
    my_genre: "RPG",
    genres: "RPG, Detective",
    how_long_to_beat: 23,
    my_score: 10,
    started_at: "2026-02-05",
    finished_at: null,
    cover: "",
    favorite_rank: 2,
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
    favorite_rank: null,
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
    favorite_rank: null,
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
  const catalogGames = [
    {
      id: 501,
      name: "Hades II",
      cover: "",
      released: "2024-05-06",
      releaseDate: "2024-05-06",
      rating: 4.6,
      metacritic: 90,
      rawgPlaytimeHours: 32,
      genres: ["Action", "RPG"],
      genresText: "Action, RPG",
      description: "<p>Defy the Titan of Time.</p>",
      metadataQuality: "full",
      cacheStatus: "live",
      alreadyInBacklog: false,
    },
  ];
  const state = {
    favoritePayloads: [],
    gamesListRequests: 0,
    reorderPayloads: [],
  };
  const rankForStatus = (status) =>
    status === "finished"
      ? 12
      : status === "played and should come back"
        ? 4
        : status === "plan to play soon"
          ? 2
          : 1;

  await page.route(`${API_BASE}/api/meta/status-groups`, (route) =>
    route.fulfill({ json: statusGroups }),
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
    }),
  );
  await page.route(`${API_BASE}/api/demo/discard`, (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route(`${API_BASE}/api/demo/heartbeat`, (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route(`${API_BASE}/api/auth/me`, (route) => {
    if (!route.request().headers().authorization) {
      return route.fulfill({
        status: 401,
        json: { error: { code: "unauthorized", message: "Unauthorized" } },
      });
    }
    return route.fulfill({
      json: {
        id: 99,
        username: "e2e_user",
        display_name: "Mobile Player",
        avatar_icon: "rocket",
        avatar_color: "blue",
        is_guest: false,
        is_public: true,
        created_at: "2025-08-09T00:00:00.000Z",
      },
    });
  });
  await page.route(`${API_BASE}/api/games/statuses-list`, (route) =>
    route.fulfill({
      json: [
        "playing",
        "plan to play soon",
        "played and should come back",
        "finished",
      ],
    }),
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
    }),
  );
  await page.route(`${API_BASE}/api/catalog/recent`, (route) =>
    route.fulfill({
      json: { results: [], source: "cache", cacheStatus: "fresh" },
    }),
  );
  await page.route(`${API_BASE}/api/catalog/browse**`, (route) =>
    route.fulfill({
      json: {
        results: catalogGames,
        shelves: [
          {
            key: "recent",
            title: "Recently Cached",
            results: catalogGames,
          },
        ],
        facets: {
          genres: [
            { genre: "Action", count: 1 },
            { genre: "RPG", count: 1 },
          ],
        },
        page: 1,
        limit: 24,
        total: 1,
        totalPages: 1,
        source: "cache",
        cacheStatus: "fresh",
      },
    }),
  );
  await page.route(`${API_BASE}/api/catalog/search**`, (route) =>
    route.fulfill({
      json: { results: catalogGames, source: "rawg", cacheStatus: "live" },
    }),
  );
  await page.route(`${API_BASE}/api/catalog/501`, (route) =>
    route.fulfill({ json: catalogGames[0] }),
  );
  await page.route(`${API_BASE}/api/catalog/501/refresh`, (route) =>
    route.fulfill({ json: { ...catalogGames[0], cacheStatus: "fresh" } }),
  );
  await page.route(`${API_BASE}/api/catalog/501/add-to-backlog`, (route) => {
    const body = route.request().postDataJSON();
    const created = {
      id: 200,
      user_id: 99,
      catalog_game_id: 501,
      name: "Hades II",
      status_rank: rankForStatus(body.status),
      position: 3000,
      my_genre: body.my_genre || "",
      genres: "Action, RPG",
      cover: "",
      rawg_id: 501,
      rawg_slug: "hades-ii",
      started_at: null,
      finished_at: null,
      ...body,
    };
    serverGames = [...serverGames, created];
    catalogGames[0] = { ...catalogGames[0], alreadyInBacklog: true };
    return route.fulfill({ status: 201, json: created });
  });
  await page.route(`${API_BASE}/api/games`, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
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
        });
    }
    state.gamesListRequests += 1;
    return route.fulfill({ json: serverGames });
  });
  await page.route(`${API_BASE}/api/games/favorites`, (route) => {
    const { favoriteIds = [] } = route.request().postDataJSON();
    state.favoritePayloads.push(favoriteIds);
    const favoriteIdSet = new Set(favoriteIds.map(Number));
    serverGames = serverGames.map((game) => {
      const rank = favoriteIds.findIndex(
        (id) => Number(id) === Number(game.id),
      );
      return {
        ...game,
        favorite_rank: favoriteIdSet.has(Number(game.id)) ? rank + 1 : null,
      };
    });
    return route.fulfill({ json: serverGames });
  });
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
      serverGames = serverGames.map((game) =>
        game.id === id ? updated : game,
      );
      return route.fulfill({ json: updated });
    }

    if (method === "DELETE") {
      serverGames = serverGames.filter((game) => game.id !== id);
      return route.fulfill({ json: { ok: true } });
    }

    return route.fulfill({ json: serverGames.find((game) => game.id === id) });
  });
  await page.route(`${API_BASE}/api/games/*/position`, (route) => {
    const id = Number(
      route
        .request()
        .url()
        .match(/\/games\/(\d+)\/position/)?.[1],
    );
    const body = route.request().postDataJSON();
    state.reorderPayloads.push({ id, body });

    const dragged = serverGames.find((game) => Number(game.id) === id);
    if (!dragged) {
      return route.fulfill({ status: 404, json: { error: "Not found" } });
    }

    const sameRank = serverGames
      .filter(
        (game) => Number(game.status_rank) === Number(dragged.status_rank),
      )
      .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
    const withoutDragged = sameRank.filter((game) => Number(game.id) !== id);
    const targetIndex = Math.max(
      0,
      Math.min(Number(body.targetIndex || 0), withoutDragged.length),
    );
    const rankOrder = [
      ...withoutDragged.slice(0, targetIndex),
      dragged,
      ...withoutDragged.slice(targetIndex),
    ].map((game, index) => ({
      ...game,
      position: (index + 1) * 1000,
      status: body.status || game.status,
    }));
    const rankOrderById = new Map(
      rankOrder.map((game) => [Number(game.id), game]),
    );
    serverGames = serverGames.map(
      (game) => rankOrderById.get(Number(game.id)) || game,
    );

    return route.fulfill({
      json: {
        game: rankOrderById.get(id),
        rank_order: rankOrder,
      },
    });
  });
  await page.route(`${API_BASE}/api/insights**`, (route) =>
    route.fulfill({ json: insights }),
  );
  await page.route(`${API_BASE}/api/public/ariel1441`, (route) =>
    route.fulfill({
      json: {
        username: "ariel1441",
        is_public: true,
        joined_at: "2025-08-09T00:00:00.000Z",
        game_count: games.length,
      },
    }),
  );
  await page.route(`${API_BASE}/api/public/ariel1441/games`, (route) =>
    route.fulfill({ json: games }),
  );

  return state;
}

test.beforeEach(async ({ page }) => {
  page.apiState = await mockApi(page);
});

test("starts the demo and renders the backlog", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("seen_onboarding_v1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Welcome to Gaming Backlog" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /try the full demo/i }).click();

  await expect(page.getByText("Baldur's Gate 3")).toBeVisible();
});

test("renders a public profile as read-only", async ({ page }) => {
  await page.goto("/u/ariel1441", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "@ariel1441" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Favorite games" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Currently playing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recently finished" }),
  ).toBeVisible();
  await expect(page.getByText("Favorite slot").first()).toBeVisible();
  await page.getByRole("button", { name: "View all games" }).click();
  await expect(page).toHaveURL(/view=games/);
  await expect(
    page.getByRole("heading", { name: "Clair Obscur: Expedition 33" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /add game/i })).toHaveCount(0);
});

test("keyboard opens public games from the profile action", async ({ page }) => {
  await page.goto("/u/ariel1441", { waitUntil: "domcontentloaded" });

  const action = page.getByRole("button", { name: "View all games" });
  await action.focus();
  await expect(action).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/view=games/);
  await expect(
    page.getByPlaceholder("Search this public backlog..."),
  ).toBeVisible();
});

test("keyboard opens and closes a public game modal with focus restoration", async ({
  page,
}) => {
  await page.goto("/u/ariel1441?view=games", {
    waitUntil: "domcontentloaded",
  });

  const openGame = page.getByRole("button", {
    name: "Open details for Baldur's Gate 3",
  });
  await openGame.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close game details" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(openGame).toBeFocused();
});

test("unknown routes render an accessible recovery page", async ({ page }) => {
  await page.goto("/does-not-exist", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to backlog" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore games" })).toBeVisible();
});

test("insights preserves all bookmarked query parameters", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto(
    "/insights?wh=20&missing=true&genreMetric=hours&genreType=rawg&genreStatus=done",
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.getByRole("heading", { name: /Insights/i })).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.toString())
    .toContain("wh=20");
  const params = new URL(page.url()).searchParams;
  expect(params.get("missing")).toBe("true");
  expect(params.get("genreMetric")).toBe("hours");
  expect(params.get("genreType")).toBe("rawg");
  expect(params.get("genreStatus")).toBe("done");
});

test("links from insights active stats back to filtered backlog", async ({
  page,
}) => {
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

test("opens the restored Reviews page from application navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("link", { name: "Reviews", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();
  await expect(
    page.getByText("A wonderfully reactive role-playing adventure."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit thoughts" }).click();
  await expect(page.getByRole("textbox", { name: "Thoughts" })).toHaveValue(
    "A wonderfully reactive role-playing adventure.",
  );
});

test("reuses one games collection while navigating between private pages", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Baldur's Gate 3")).toBeVisible();
  await expect.poll(() => page.apiState.gamesListRequests).toBe(1);

  await page.getByRole("link", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await page.getByRole("link", { name: "Reviews", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();

  expect(page.apiState.gamesListRequests).toBe(1);
});

test("adds, edits, and deletes a game in the backlog", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: /add game/i }).click();
  await expect(page.getByRole("heading", { name: "Add game" })).toBeVisible();
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
  const gameDialog = page.getByRole("dialog");
  await expect(gameDialog.getByLabel("Name")).toHaveValue("Hollow Knight");
  await page.getByLabel("My score").fill("9");
  await gameDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Game updated.")).toBeVisible();
  await gameDialog.getByRole("button", { name: "Close game details" }).click();
  await expect(gameDialog).toBeHidden();

  await addedCard.getByLabel("Delete game").click();
  await expect(
    page.getByRole("heading", { name: "Delete game?" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hollow Knight" }),
  ).toHaveCount(0);
});

test("reorders same-rank games without sending a status change", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const baldursGate = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Baldur's Gate 3" }),
  });
  const disco = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Disco Elysium" }),
  });

  await expect(baldursGate).toBeVisible();
  await expect(disco).toBeVisible();

  const source = await disco.boundingBox();
  const target = await baldursGate.boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();

  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    {
      steps: 12,
    },
  );
  await page.mouse.up();

  await expect
    .poll(() => page.apiState.reorderPayloads.length)
    .toBeGreaterThan(0);
  expect(page.apiState.reorderPayloads.at(-1)).toEqual({
    id: 4,
    body: { targetIndex: 0 },
  });
  await expect
    .poll(async () =>
      page
        .locator("article h3")
        .evaluateAll((headings) =>
          headings.map((heading) => heading.textContent),
        ),
    )
    .toEqual([
      "Disco Elysium",
      "Baldur's Gate 3",
      "Returnal",
      "Clair Obscur: Expedition 33",
    ]);
});

test("derived backlog views cannot mutate canonical manual order", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/search/i).fill("Baldur");
  await expect(
    page.getByText(/Manual reordering is available after clearing search/i),
  ).toBeVisible();
  expect(page.apiState.reorderPayloads).toEqual([]);
  await expect(page.getByLabel("Edit game").first()).toBeVisible();
});

test("updates favorite games from public profile settings", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Public profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Favorite games", level: 2 }),
  ).toBeVisible();

  await page.getByLabel("Move Disco Elysium up").click();
  await page.getByLabel("Remove Baldur's Gate 3 from favorites").click();
  await page
    .getByRole("button", { name: "Clair Obscur: Expedition 33" })
    .click();
  await page.getByRole("button", { name: "Save favorites" }).click();

  await expect
    .poll(() => page.apiState.favoritePayloads.length)
    .toBeGreaterThan(0);
  expect(page.apiState.favoritePayloads.at(-1)).toEqual([4, 2]);
  await expect(page.getByText("Favorite games saved.")).toBeVisible();
});

test("discovers a catalog game and adds it to the backlog", async ({
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
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/discover", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(750);
  expect(runtimeErrors, "Discover emitted runtime errors").toEqual([]);

  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recently Cached" }),
  ).toBeVisible();
  await page.getByPlaceholder("Search games...").fill("hades");
  const searchResults = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Search results" }),
  });
  await expect(
    searchResults.getByRole("heading", { name: "Hades II" }),
  ).toBeVisible();

  await searchResults.getByRole("heading", { name: "Hades II" }).click();
  await expect(
    page.getByRole("heading", { name: "Add to backlog" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Status" }).click();
  await page.getByRole("option", { name: "playing" }).click();
  await page.getByLabel("My Genre").fill("Action Roguelike");
  await page.getByRole("button", { name: "Add to backlog" }).click();
  await expect(page.getByText("Game added to backlog.")).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("link", { name: "Backlog", exact: true }).click();
  await expect(page.getByText("Hades II")).toBeVisible();
});

test("mobile navigation exposes More destinations and account controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "saved-account-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/reviews", { waitUntil: "domcontentloaded" });

  const mobileNavigation = page.getByRole("navigation", {
    name: "Mobile primary navigation",
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("link")).toHaveCount(4);
  await expect(
    mobileNavigation.getByRole("button", { name: "More destinations" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page
      .getByRole("button", { name: "Open account menu" })
      .locator(".lucide-rocket"),
  ).toBeVisible();

  await mobileNavigation
    .getByRole("button", { name: "More destinations" })
    .click();
  const moreSheet = page.getByRole("dialog", { name: "More" });
  await expect(moreSheet).toBeVisible();
  await expect(moreSheet.getByRole("link", { name: "Reviews" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    moreSheet.getByRole("link", { name: "Steam Library" }),
  ).toBeVisible();
  await expect(
    moreSheet.getByRole("link", { name: "Steam Review" }),
  ).toBeVisible();
  await expect(moreSheet.getByRole("link", { name: "Profile" })).toBeVisible();
  await expect(moreSheet.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(moreSheet.getByRole("button", { name: "Log out" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(moreSheet).toBeHidden();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "More" }).getByRole("link", {
      name: "Profile",
    }),
  ).toBeFocused();
});
