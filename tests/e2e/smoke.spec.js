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
    games: 4,
    estimatedGames: 4,
    missingEstimates: 0,
    wishlist: 2,
    finished: 1,
    playing: 3,
  },
  games: games.map((game) => ({
    id: game.id,
    name: game.name,
    status: game.status,
    score: game.my_score,
    startedAt: game.started_at,
    finishedAt: game.finished_at,
    personalGenres: game.my_genre ? [game.my_genre] : [],
    rawgGenres: game.genres ? game.genres.split(", ") : [],
    hours: game.how_long_to_beat,
  })),
  byStatus: [
    { status: "playing", rank: 1, count: 2, hours: 93 },
    { status: "played and should come back", rank: 4, count: 1, hours: 21 },
    { status: "finished", rank: 12, count: 1, hours: 25 },
  ],
  yearly: [
    { year: 2025, started: 1, finished: 0 },
    { year: 2026, started: 3, finished: 1 },
  ],
  focused: {
    games: 4,
    started: 4,
    finished: 1,
    playing: 3,
    estimatedGames: 4,
    missingEstimates: 0,
    rated: 4,
    averageScore: 9.25,
    scores: Array.from({ length: 21 }, (_, index) => ({
      score: index / 2,
      count: [8, 9, 10].includes(index / 2)
        ? games.filter((game) => game.my_score === index / 2).length
        : 0,
    })),
  },
};

function gameHours(game) {
  const value = Number(game.displayHLTB ?? game.how_long_to_beat);
  return Number.isFinite(value) ? value : null;
}

function pagedGamesPayload(collection, requestUrl) {
  const url = new URL(requestUrl);
  const params = url.searchParams;
  let filtered = [...collection];
  const query = (params.get("q") || "").trim().toLowerCase();
  const statuses = params.getAll("status").map((value) => value.toLowerCase());
  const genres = params.getAll("genre").map((value) => value.toLowerCase());
  const personalGenres = params.getAll("personal_genre").map((value) => value.toLowerCase());
  if (query) filtered = filtered.filter((game) => game.name.toLowerCase().includes(query));
  if (statuses.length) filtered = filtered.filter((game) => statuses.includes(game.status.toLowerCase()));
  if (genres.length) filtered = filtered.filter((game) => {
    const values = String(game.genres || "").split(",").map((value) => value.trim().toLowerCase());
    return genres.some((genre) => values.includes(genre));
  });
  if (personalGenres.length) filtered = filtered.filter((game) => {
    const values = String(game.my_genre || "").split(",").map((value) => value.trim().toLowerCase());
    return personalGenres.some((genre) => values.includes(genre));
  });
  if (params.get("score") != null) filtered = filtered.filter((game) => Number(game.my_score) === Number(params.get("score")));
  if (params.get("rated") === "true") filtered = filtered.filter((game) => game.my_score != null);
  const minHours = params.get("min_hours");
  const maxHours = params.get("max_hours");
  if (minHours != null) filtered = filtered.filter((game) => gameHours(game) >= Number(minHours));
  if (maxHours != null) filtered = filtered.filter((game) => gameHours(game) <= Number(maxHours));
  if (params.get("missing_estimates") === "true") filtered = filtered.filter((game) => gameHours(game) == null);
  const dateType = params.get("date_type");
  const year = Number(params.get("date_year"));
  if (dateType === "startedYear") filtered = filtered.filter((game) => new Date(game.started_at).getUTCFullYear() === year);
  if (dateType === "finishedYear") filtered = filtered.filter((game) => new Date(game.finished_at).getUTCFullYear() === year);
  if (dateType === "touchedYear") filtered = filtered.filter((game) =>
    [game.started_at, game.finished_at].some((value) => value && new Date(value).getUTCFullYear() === year));

  const direction = params.get("direction") === "desc" ? -1 : 1;
  const sort = params.get("sort") || "";
  const optionalNumber = (value) => value == null ? Number.POSITIVE_INFINITY : Number(value);
  filtered.sort((left, right) => {
    let result = 0;
    if (sort === "name") result = left.name.localeCompare(right.name);
    else if (sort === "score") result = optionalNumber(left.my_score) - optionalNumber(right.my_score);
    else if (sort === "estimated_hours") result = optionalNumber(gameHours(left)) - optionalNumber(gameHours(right));
    else if (sort === "started_date") result = String(left.started_at || "9999").localeCompare(String(right.started_at || "9999"));
    else if (sort === "finished_date") result = String(left.finished_at || "9999").localeCompare(String(right.finished_at || "9999"));
    else result = Number(left.status_rank ?? 999) - Number(right.status_rank ?? 999)
      || Number(left.position ?? Number.MAX_SAFE_INTEGER) - Number(right.position ?? Number.MAX_SAFE_INTEGER)
      || Number(left.id) - Number(right.id);
    return result * direction;
  });
  const total = filtered.length;
  const limit = Number(params.get("limit") || total || 50);
  const offset = Number(params.get("offset") || 0);
  const allGenres = [...new Set(collection.flatMap((game) => String(game.genres || "").split(",").map((value) => value.trim()).filter(Boolean)))].sort();
  const allHours = collection.map(gameHours).filter((value) => value != null);
  return {
    games: filtered.slice(offset, offset + limit),
    total,
    snapshotVersion: JSON.stringify(filtered.map((game) => [game.id, game.status, game.position, game.my_score])),
    facets: params.get("include_summary") === "false" ? undefined : {
      collectionTotal: collection.length,
      genres: allGenres,
      hoursBounds: {
        min: allHours.length ? Math.floor(Math.min(...allHours)) : 0,
        max: allHours.length ? Math.ceil(Math.max(...allHours)) : 0,
      },
    },
    limit,
    offset,
  };
}

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
    fullGamesListRequests: 0,
    pagedGamesListRequests: 0,
    finishPayloads: [],
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
  // Steam experience polling is a saved-data read. Keep generic smoke tests
  // independent of a separately running Express server.
  await page.route(`${API_BASE}/api/steam/sync-health`, (route) =>
    route.fulfill({
      json: {
        account: null,
        activeJob: null,
        runs: [],
        lastScheduledAt: null,
      },
    }),
  );
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
  await page.route(`${API_BASE}/api/personal-genres`, (route) =>
    route.fulfill({
      json: {
        genres: [
          { id: 1, name: "Action", usageCount: 1 },
          { id: 2, name: "RPG", usageCount: 3 },
        ],
      },
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
  await page.route(new RegExp(`^${API_BASE}/api/games(?:\\?.*)?$`), (route) => {
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
    const requestUrl = route.request().url();
    if (new URL(requestUrl).searchParams.has("limit")) {
      state.pagedGamesListRequests += 1;
      return route.fulfill({ json: pagedGamesPayload(serverGames, requestUrl) });
    }
    state.fullGamesListRequests += 1;
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
  await page.route(`${API_BASE}/api/games/*/finish`, (route) => {
    const id = Number(route.request().url().match(/\/games\/(\d+)\/finish/)?.[1]);
    const body = route.request().postDataJSON();
    state.finishPayloads.push({ id, body });
    const current = serverGames.find((game) => Number(game.id) === id);
    const completionStatus = body.completion_status || "finished";
    const updated = {
      ...current,
      ...body,
      status: completionStatus,
      status_rank: rankForStatus(completionStatus),
    };
    serverGames = serverGames.map((game) => Number(game.id) === id ? updated : game);
    return route.fulfill({
      json: {
        game: updated,
        outcome: completionStatus === "finished" ? "finished" : "completed",
        clearedFocusRole: "",
      },
    });
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
  await expect(page.getByRole("dialog", { name: "Sign in" })).toHaveCount(0);
  if ((page.viewportSize()?.width || 0) < 768) {
    await page.getByRole("button", { name: "Filters and view", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Status", exact: true })).toBeVisible();
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

test("links from insights playing stats back to filtered backlog", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/insights", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /Insights/i })).toBeVisible();
  await page
    .locator("main section")
    .first()
    .getByRole("button", { name: /^Playing/ })
    .click();

  await expect(page).toHaveURL(/group=playing/);
  await expect(page.getByText("Baldur's Gate 3")).toBeVisible();
  await expect(page.getByText("Clair Obscur: Expedition 33")).toHaveCount(0);
});

test("insights score bars open the exact-score backlog filter", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/insights", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", {
    name: "View 2 games rated 10 out of 10",
  }).click();

  await expect(page).toHaveURL(/score=10/);
  await expect(page.getByText("2 shown")).toBeVisible();
  await expect(page.getByText("Disco Elysium")).toBeVisible();
  await expect(page.getByText("Baldur's Gate 3")).toHaveCount(0);
});

test("the Insights rated-games card opens the rated Backlog filter", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/insights", { waitUntil: "domcontentloaded" });

  await page.locator("main section").first().getByRole("button", { name: /^Rated games/ }).click();

  await expect(page).toHaveURL(/rated=true/);
  await expect(page.getByRole("button", { name: "Remove rated games filter" })).toBeVisible();
});

test("a selected Insights year scopes summary-card click-throughs", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/insights", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Select year" }).click();
  await page.getByRole("option", { name: "2026" }).click();
  await expect(page.getByRole("heading", { name: "Status of 2026 games" })).toBeVisible();

  await page.locator("main section").first().getByRole("button", { name: /^Started/ }).click();
  await expect(page).toHaveURL(/dateType=started/);
  await expect(page).toHaveURL(/year=2026/);
});

test("an Insights year and genre query keeps the exact Backlog scope", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/?genreType=my&genre=RPG&insightsYear=2026", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("button", {
    name: "Remove Started or finished in 2026 filter",
  })).toBeVisible();
  await expect(page.getByText("3 shown")).toBeVisible();
  await expect(page.getByText("Returnal")).toHaveCount(0);
});

test("the Insights Other status filter never opens the full backlog", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route(`${API_BASE}/api/games/statuses-list`, (route) =>
    route.fulfill({
      json: [
        "playing",
        "plan to play soon",
        "played and should come back",
        "finished",
        "on hold",
      ],
    }),
  );
  await page.route(new RegExp(`^${API_BASE}/api/games(?:\\?.*)?$`), (route) => {
    const collection = [
      ...games,
      {
        id: 50,
        name: "Paused Game",
        status: "on hold",
        status_rank: 5,
        position: 1000,
        my_genre: "Adventure",
        genres: "Adventure",
        how_long_to_beat: 12,
        cover: "",
      },
    ];
    return route.fulfill({ json: pagedGamesPayload(collection, route.request().url()) });
  });
  await page.goto("/?group=other", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Paused Game")).toBeVisible();
  await expect(page.getByText("Baldur's Gate 3")).toHaveCount(0);
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

test("loads the paged backlog once and reuses the full collection between legacy private pages", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Baldur's Gate 3")).toBeVisible();
  await expect.poll(() => page.apiState.gamesListRequests).toBe(1);
  expect(page.apiState.pagedGamesListRequests).toBe(1);
  expect(page.apiState.fullGamesListRequests).toBe(0);

  await page.getByRole("link", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await page.getByRole("link", { name: "Reviews", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();

  expect(page.apiState.gamesListRequests).toBe(2);
  expect(page.apiState.pagedGamesListRequests).toBe(1);
  expect(page.apiState.fullGamesListRequests).toBe(1);
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

  await addedCard.getByLabel("Actions for Hollow Knight").click();
  await page.getByRole("menuitem", { name: "Edit game" }).click();
  const gameDialog = page.getByRole("dialog");
  await expect(gameDialog.getByLabel("Name")).toHaveValue("Hollow Knight");
  await page.getByLabel("My score").fill("9");
  await gameDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Game updated.")).toBeVisible();
  await gameDialog.getByRole("button", { name: "Close game details" }).click();
  await expect(gameDialog).toBeHidden();

  await addedCard.getByLabel("Actions for Hollow Knight").click();
  await page.getByRole("menuitem", { name: "Delete game" }).click();
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

test("reorders games when a status-only filter keeps the complete rank visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Status", exact: true }).click();
  await page.getByRole("button", { name: "playing", exact: true }).click();
  await page.keyboard.press("Escape");

  const baldursGate = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Baldur's Gate 3" }),
  });
  const disco = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Disco Elysium" }),
  });
  await expect(baldursGate).toBeVisible();
  await expect(disco).toBeVisible();
  await expect(page.getByText(/Clear search and filters to reorder games/i)).toHaveCount(0);

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
    { steps: 12 },
  );
  await page.mouse.up();

  await expect
    .poll(() => page.apiState.reorderPayloads.at(-1))
    .toEqual({ id: 4, body: { targetIndex: 0 } });
});

test("derived backlog views cannot mutate canonical manual order", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/search/i).fill("r");
  await expect(
    page.getByText(/Clear search and filters to reorder games/i),
  ).toBeVisible();
  await page.getByPlaceholder(/search/i).press("Escape");
  expect(page.apiState.reorderPayloads).toEqual([]);
  await page.getByLabel("Actions for Baldur's Gate 3").click();
  await expect(
    page.getByRole("menuitem", { name: "Edit game" }),
  ).toBeVisible();
});

test("finishing a game keeps the completion result open during backlog refresh", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Baldur's Gate 3" }),
  });
  await card.getByLabel("Actions for Baldur's Gate 3").click();
  await page.getByRole("menuitem", { name: "Finish game" }).click();
  const dialog = page.getByRole("dialog", { name: "Finish Baldur's Gate 3" });
  await dialog.getByRole("button", { name: "Finish game" }).click();

  await expect(page.getByRole("dialog", { name: "Completion saved" })).toBeVisible();
  await expect(page.getByText("Baldur's Gate 3 is now Finished.")).toBeVisible();
  expect(page.apiState.finishPayloads).toHaveLength(1);
});

test("backlog filters stay open while server results update", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route(new RegExp(`^${API_BASE}/api/games(?:\\?.*)?$`), async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("limit") && url.searchParams.has("status")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return route.fulfill({
      json: url.searchParams.has("limit")
        ? pagedGamesPayload(games, route.request().url())
        : games,
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const firstCard = page.locator("article").first();
  const beforeFilter = await firstCard.boundingBox();
  await page.getByRole("button", { name: "Status", exact: true }).click();
  const playingOption = page.getByRole("button", { name: "playing", exact: true });
  await playingOption.click();
  await page.waitForTimeout(200);

  const duringFilter = await firstCard.boundingBox();
  await expect(playingOption).toBeVisible();
  await expect(page.getByRole("button", { name: /Status 1/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Baldur's Gate 3" })).toBeVisible();
  expect(duringFilter?.y).toBe(beforeFilter?.y);
});

test("a failed background filter refresh keeps the loaded backlog usable", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route(new RegExp(`^${API_BASE}/api/games(?:\\?.*)?$`), (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("limit") && url.searchParams.has("status")) {
      return route.fulfill({ status: 503, json: { error: { message: "Try again later" } } });
    }
    return route.fulfill({
      json: url.searchParams.has("limit")
        ? pagedGamesPayload(games, route.request().url())
        : games,
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Status", exact: true }).click();
  const playingOption = page.getByRole("button", { name: "playing", exact: true });
  await playingOption.click();

  await expect(page.getByText("Could not refresh this view. Your loaded games are still available."))
    .toBeVisible({ timeout: 10_000 });
  await expect(playingOption).toBeVisible();
  await expect(page.getByRole("heading", { name: "Baldur's Gate 3" })).toBeVisible();
});

test("game details keep their active tab during a metadata refresh", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route(`${API_BASE}/api/games/1/metadata/refresh`, (route) =>
    route.fulfill({ json: { ...games[0], rating: 4.8 } }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Baldur's Gate 3" }),
  });
  await card.getByRole("heading", { name: "Baldur's Gate 3" }).click();
  const dialog = page.getByRole("dialog", { name: "Baldur's Gate 3" });
  const thoughtsTab = dialog.getByRole("button", { name: "Your thoughts" });
  await thoughtsTab.click();
  await dialog.getByRole("button", { name: "More actions for Baldur's Gate 3" }).click();
  await page.getByRole("menuitem", { name: "Refresh metadata" }).click();

  await expect(page.getByText("Baldur's Gate 3 metadata refreshed.")).toBeVisible();
  await expect(thoughtsTab).toHaveAttribute("aria-pressed", "true");
  await expect(dialog).toBeVisible();
});

test("backlog search keeps fuzzy matching after pagination", async ({ page }) => {
  const collection = [
    ...games,
    {
      ...games[0],
      id: 55,
      name: "Metaphor: ReFantazio",
      position: 5000,
    },
  ];
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route(new RegExp(`^${API_BASE}/api/games(?:\\?.*)?$`), (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: url.searchParams.has("limit")
        ? pagedGamesPayload(collection, route.request().url())
        : collection,
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByPlaceholder(/Search/).fill("Metapor");
  await expect(page.getByRole("heading", { name: "Metaphor: ReFantazio" })).toBeVisible();
});

test("Surprise me can choose beyond the first backlog page", async ({ page }) => {
  const collection = Array.from({ length: 51 }, (_, index) => ({
    ...games[0],
    id: index + 1,
    name: index === 50 ? "Beyond Page Fifty" : `Paged game ${index + 1}`,
    position: (index + 1) * 1000,
  }));
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
    Math.random = () => 0.999;
  });
  await page.route(new RegExp(`^${API_BASE}/api/games(?:\\?.*)?$`), (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: url.searchParams.has("limit")
        ? pagedGamesPayload(collection, route.request().url())
        : collection,
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Surprise me" }).click();
  await expect(page.getByRole("dialog", { name: "Beyond Page Fifty" })).toBeVisible();
});

test("a game can be completed without marking it finished", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Baldur's Gate 3" }),
  });
  await card.getByLabel("Actions for Baldur's Gate 3").click();
  await page.getByRole("menuitem", { name: "Finish game" }).click();
  const dialog = page.getByRole("dialog", { name: "Finish Baldur's Gate 3" });
  await dialog.getByText("Mark as played a lot, but not finished").click();
  await dialog.getByRole("button", { name: "Save completion" }).click();

  await expect(page.getByRole("dialog", { name: "Completion saved" })).toBeVisible();
  await expect(page.getByText(
    "Baldur's Gate 3 is now Played a lot, but didn’t finish.",
  )).toBeVisible();
  expect(page.apiState.finishPayloads).toHaveLength(1);
  expect(page.apiState.finishPayloads[0].body.completion_status)
    .toBe("played alot but didnt finish");
});

test("editing a RAWG fallback game keeps its estimate automatic", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'demo-token');
    window.localStorage.setItem('seen_onboarding_v1', '1');
  });
  const fallbackGame = { ...games[0], estimateSource: 'rawg_playtime', displayHLTB: 70 };
  await page.route(new RegExp(`^${API_BASE}/api/games(?:\\?.*)?$`), route =>
    route.fulfill({ json: pagedGamesPayload([fallbackGame], route.request().url()) }));
  let update;
  await page.route(`${API_BASE}/api/games/1`, route => {
    update = route.request().postDataJSON();
    return route.fulfill({ json: { ...fallbackGame, ...update } });
  });
  await page.goto('/');
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: "Baldur's Gate 3" }) });
  await expect(card.getByTitle('RAWG playtime fallback', { exact: true })).toBeVisible();
  await card.getByLabel("Actions for Baldur's Gate 3").click();
  await page.getByRole('menuitem', { name: 'Edit game' }).click();
  await page.getByLabel('My score').fill('8');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Game updated.')).toBeVisible();
  expect(update.my_score).toBe(8);
  expect(Object.hasOwn(update, 'how_long_to_beat')).toBe(false);
  await expect(page.getByRole('dialog').getByText('RAWG playtime fallback')).toBeVisible();
});

test("game genre picker floats within the modal and exposes its final option", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "demo-token");
    window.localStorage.setItem("seen_onboarding_v1", "1");
  });
  await page.route(`${API_BASE}/api/personal-genres`, (route) => route.fulfill({
    json: {
      genres: Array.from({ length: 18 }, (_, index) => ({
        id: index + 1,
        name: index === 0 ? "RPG" : `Modal genre ${index + 1}`,
        usageCount: 0,
      })),
    },
  }));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Baldur's Gate 3" }) });
  await card.getByLabel("Actions for Baldur's Gate 3").click();
  await page.getByRole("menuitem", { name: "Edit game" }).click();
  await page.getByLabel("My genres").click();

  const listbox = page.getByRole("listbox").last();
  const lastOption = page.getByRole("option", { name: "Modal genre 18" });
  await lastOption.scrollIntoViewIfNeeded();
  await expect(lastOption).toBeVisible();
  const box = await listbox.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(600);
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
  await page.getByLabel("My genres").click();
  await page
    .getByPlaceholder("Find or add a genre...")
    .fill("Action Roguelike");
  await page.getByRole("button", { name: 'Add "Action Roguelike"' }).click();
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
