import { expect, test } from "@playwright/test";

for (const [label, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
  ["legacy wishlist", { width: 1440, height: 1000 }],
]) {
  test(`notifications ${label}: grouped direct actions, recovery and keyboard dismissal`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = [],
      writes = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("token", "notification-test");
      localStorage.setItem("seen_onboarding_v1", "1");
      localStorage.setItem("gaming_backlog_sidebar_collapsed_v1", "0");
    });
    const games = [
      { id: 1, name: "Hades", status: "plan to play", position: 0 },
      { id: 2, name: "Celeste", status: "finished", position: 1 },
    ];
    const account = { id: 1, autoSyncEnabled: false, priceRevision: "1" };
    const event = (id, title, type, payload = {}) => ({
      id,
      title,
      source: "steam_library",
      eventType: type,
      state: "open",
      eventKind: "decision",
      externalId: String(id),
      payload,
      observedAt: new Date().toISOString(),
      gameId: payload.gameId || null,
    });
    const facts = [
      event(11, "Hollow Knight", "steam_new_game"),
      event(12, "Celeste", "steam_new_game"),
      event(13, "Hades", "steam_status_suggestion", {
        gameId: 1,
        playtimeMinutes: 80,
      }),
      event(15, "Unmatched Steam game", "steam_new_game"),
    ];
    const price = {
      ...event(
        14,
        "A very long Wishlist game title: The Complete Adventure and Definitive Collection",
        "steam_sale_started",
      ),
      source: "steam_prices",
      state: "resolved",
      eventKind: "fact",
      wishlistItemId: 9,
      payload: { currency: "ILS", previousMinor: 10000, currentMinor: 5000 },
    };
    const dismissed = new Set(),
      read = new Set();
    facts[0].wishlistContext = {
      id: 9,
      localActive: true,
      removedFromSteam: true,
    };
    facts[0].nowOwned = true;
    facts.push(
      event(16, "Portal", "steam_started_playing", { playtimeMinutes: 25 }),
    );
    const other = {
      ...event(17, "Wishlist membership changed", "wishlist_added"),
      source: "steam_wishlist",
      state: "resolved",
    };
    let failPlaying = true,
      failRetirement = true,
      hiddenOther = false;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname,
        method = route.request().method();
      const data = method !== "GET" ? route.request().postDataJSON() : null;
      if (method !== "GET") writes.push({ path, data });
      const json = (body) => route.fulfill({ json: body });
      if (path === "/api/auth/me")
        return json({ id: 99, username: "notifications", preferences: {} });
      if (path === "/api/meta/status-groups")
        return json({
          groups: {
            planned: ["plan to play"],
            playing: ["playing"],
            done: ["finished"],
            other: [],
          },
          buckets: {},
        });
      if (path === "/api/games") return json(games);
      if (path === "/api/games/statuses-list")
        return json(["plan to play", "playing", "finished"]);
      if (path === "/api/steam/sync-health")
        return json({ account, activeJob: null, runs: [] });
      if (path === "/api/steam/account") return json({ account });
      if (path === "/api/wishlist")
        return json({
          items: [],
          total: 0,
          account,
          snapshotVersion: "1",
          priceRevision: "1",
          priceHealth: {},
          metadata: {},
        });
      if (path === "/api/wishlist/9/retire-intention") {
        expect(data).toEqual({ gameId: 3 });
        if (failRetirement) {
          failRetirement = false;
          return route.fulfill({
            status: 503,
            json: { error: { message: "Try again" } },
          });
        }
        return json({ localActive: false });
      }
      if (path === "/api/activity/inbox/hide-other") {
        expect(data).toEqual({ snapshot: "17" });
        hiddenOther = true;
        return json({ updated: 51 });
      }
      if (path === "/api/activity/inbox/activate")
        return json({ activated: true });
      if (path === "/api/activity/inbox" && method === "PATCH") {
        for (const id of data.eventIds)
          (data.action === "dismiss" ? dismissed : read).add(id);
        return json({ updated: data.eventIds.length });
      }
      if (path === "/api/activity/inbox")
        return json({
          snapshot: "17",
          nextCursor: null,
          counts: {
            pendingDecisions: facts.filter((item) => !dismissed.has(item.id))
              .length,
          },
          groups: (url.searchParams.get("section") === "attention"
            ? facts
            : [price, ...(hiddenOther ? [] : [other])]
          )
            .filter((item) => !dismissed.has(item.id))
            .map((item) => ({
              id: String(item.id),
              unseen: !read.has(item.id),
              events: [item],
            })),
        });
      if (/^\/api\/activity\/\d+$/.test(path)) {
        dismissed.add(Number(path.split("/").at(-1)));
        return json({});
      }
      if (path === "/api/steam/link-candidates") {
        const id = Number(url.searchParams.get("appId"));
        return json({
          results: [
            {
              id,
              steamAppId: String(id),
              importStatus: "pending",
              proposedCatalogGameId: id === 15 ? null : id,
              proposedCatalogName: id === 11 ? "Hollow Knight" : "Celeste",
              ...(label === 'legacy wishlist' && id === 11 ? { linkedGameId: 3, linkedGameStatus: 'wishlist', linkedGameName: 'Hollow Knight' } : {}),
            },
          ],
        });
      }
      if (path === '/api/wishlist/9/move-to-backlog') {
        expect(label).toBe('legacy wishlist');
        expect(data).toEqual({ status: 'finished' });
        return json({ gameId: 3, wishlistItemId: 9 });
      }
      if (/\/api\/steam\/import-candidates\/(11|16)$/.test(path)) {
        expect(data).toEqual({
          action: "set_status",
          status: path.endsWith("16") ? "playing" : "finished",
        });
        return json({});
      }
      if (path === "/api/steam/import") {
        expect([11, 16]).toContain(data.candidateIds[0]);
        return json({
          imported: [{ candidateId: 11, gameId: 3 }],
          attached: [],
          skipped: [],
        });
      }
      if (path === "/api/steam/link-candidates/12/attach") {
        expect(data).toEqual({ gameId: 2 });
        return json({ attached: true, gameId: 2 });
      }
      if (path === "/api/steam/games/1/status-suggestion") {
        expect(data).toEqual({
          status: "playing",
          setStartedAt: false,
          activityEventId: 13,
        });
        if (failPlaying) {
          failPlaying = false;
          return route.fulfill({
            status: 409,
            json: {
              error: { message: "Could not save this suggestion. Try again." },
            },
          });
        }
        games[0].status = "playing";
        return json({ game: games[0], activityEventResolved: true });
      }
      return json({});
    });
    await page.goto("/wishlist");
    await expect(
      page.getByRole("heading", { name: "Wishlist", exact: true }),
    ).toBeVisible();
    const bell = page
      .getByRole("button", { name: /^Notifications/, includeHidden: true })
      .filter({ visible: true });
    await expect(bell).toBeVisible();
    await expect(bell).toHaveAttribute(
      "aria-label",
      "Notifications, 5 pending decisions",
    );
    await expect(
      page.getByRole("dialog", { name: "Notifications", exact: true }),
    ).toHaveCount(0);
    await bell.click();
    const panel = page.getByRole("dialog", {
      name: "Notifications",
      exact: true,
    });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText("5 decisions waiting", { exact: true }),
    ).toBeVisible();
    const initialPanelBounds = await panel.boundingBox();
    if (label === "desktop") {
      await expect(
        page.locator("aside").getByRole("button", { name: /^Notifications/ }),
      ).toHaveCount(0);
      const bellBounds = await bell.boundingBox();
      expect(
        Math.abs(initialPanelBounds.y - bellBounds.y - bellBounds.height - 8),
      ).toBeLessThan(2);
      expect(
        Math.abs(
          initialPanelBounds.x +
            initialPanelBounds.width -
            bellBounds.x -
            bellBounds.width,
        ),
      ).toBeLessThan(2);
    }
    await expect(
      panel.locator("summary").filter({ hasText: "New games on Steam" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`notifications-${label}-collapsed.png`),
    });
    await panel
      .locator("summary")
      .filter({ hasText: "New games on Steam" })
      .click();
    const hollow = panel.getByRole("article", {
      name: "Hollow Knight",
      exact: true,
    });
    await expect(
      hollow.getByRole("button", { name: "Add to Backlog", exact: true }),
    ).toBeDisabled();
    await hollow
      .getByRole("button", { name: "Backlog status", exact: true })
      .click();
    await expect(hollow.getByRole("listbox")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`notifications-${label}-status.png`),
    });
    await hollow.getByRole("option", { name: "finished", exact: true }).click();
    await hollow
      .getByText("Also remove from my Wishlist", { exact: true })
      .click();
    await expect(
      hollow.getByRole("checkbox", { name: "Also remove from my Wishlist" }),
    ).toBeChecked();
    await expect(
      hollow.getByRole("button", { name: "Add to Backlog", exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath(`notifications-${label}-expanded.png`),
      animations: "disabled",
    });
    if (label === "desktop") {
      const expandedBounds = await panel.boundingBox();
      expect(expandedBounds.y).toBe(initialPanelBounds.y);
      expect(expandedBounds.y + expandedBounds.height).toBeLessThanOrEqual(
        viewport.height - 11,
      );
    }
    await hollow
      .getByRole("button", { name: "Add to Backlog", exact: true })
      .click();
    await expect(hollow.getByRole("status")).toContainText(
      "Added to Backlog · finished",
    );
    await expect(hollow.getByRole("status")).toContainText(
      "reminder is still saved",
    );
    await hollow
      .getByRole("button", { name: "Retry Wishlist removal" })
      .click();
    await expect(hollow.getByRole("status")).toContainText(
      "Wishlist reminder removed",
    );
    await expect(bell).toHaveAttribute(
      "aria-label",
      "Notifications, 4 pending decisions",
    );
    await expect(hollow.getByText("Today", { exact: true })).toBeVisible();
    await expect(
      hollow.locator("summary").filter({ hasText: "Completed" }),
    ).toHaveText("Completed · Show result", { timeout: 6000 });
    await hollow.locator("summary").filter({ hasText: "Completed" }).click();
    await expect(hollow.getByRole("status")).toContainText(
      "Wishlist reminder removed",
    );
    const celeste = panel.getByRole("article", {
      name: "Celeste",
      exact: true,
    });
    await celeste
      .locator("summary")
      .filter({ hasText: "More options" })
      .click();
    await celeste
      .getByRole("button", { name: "Link existing game", exact: true })
      .click();
    await celeste.getByLabel("Find a Backlog game").fill("Celeste");
    await celeste
      .getByRole("button", { name: "Existing Backlog game", exact: true })
      .click();
    await celeste
      .getByRole("option", { name: "Celeste · finished", exact: true })
      .click();
    await celeste
      .getByRole("button", { name: "Confirm link", exact: true })
      .click();
    await expect(celeste.getByRole("status")).toContainText(
      "Its status was kept",
    );
    const unmatched = panel.getByRole("article", {
      name: "Unmatched Steam game",
      exact: true,
    });
    await expect(
      unmatched.getByRole("button", { name: "Add to Backlog", exact: true }),
    ).toHaveCount(0);
    await expect(
      unmatched.getByRole("link", { name: "Match review", exact: true }),
    ).toBeVisible();
    await unmatched
      .getByRole("button", { name: "Don’t add", exact: true })
      .click();
    await expect(unmatched.getByRole("status")).toContainText(
      "Not added. Still available in Steam Library.",
    );
    await panel
      .locator("summary")
      .filter({ hasText: "Started on Steam" })
      .click();
    const portal = panel.getByRole("article", { name: "Portal", exact: true });
    await portal.getByRole("button", { name: "Add as Playing" }).click();
    await expect(portal.getByRole("status")).toContainText(
      "Added to Backlog · playing",
    );
    await panel.locator("summary").filter({ hasText: "Other updates" }).click();
    await panel.getByRole("button", { name: "Hide all updates" }).click();
    await expect(panel.getByText(/51 updates hidden/)).toBeVisible();
    await panel
      .locator("summary")
      .filter({ hasText: "Move to Playing?" })
      .click();
    const hades = panel.getByRole("article", { name: "Hades", exact: true });
    await hades.getByRole("button", { name: "Accept Playing" }).click();
    await expect(hades.getByRole("alert")).toContainText("Could not save");
    await hades.getByRole("button", { name: "Accept Playing" }).click();
    await expect(hades.getByRole("status")).toContainText(
      "Dates kept unchanged",
    );
    await panel
      .locator("summary")
      .filter({ hasText: "Wishlist price drops" })
      .click();
    await panel.getByRole("button", { name: "Mark read", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: "Mark read", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(bell).toBeFocused();
    await bell.press("Enter");
    await expect(
      panel.locator("summary").filter({ hasText: "New games on Steam" }),
    ).toHaveCount(0);
    await panel
      .locator("summary")
      .filter({ hasText: "Wishlist price drops" })
      .click();
    await panel.getByRole("button", { name: "Hide update" }).click();
    await expect(panel.getByRole("article").getByRole("status")).toContainText(
      "Update hidden",
    );
    await page.keyboard.press("Escape");
    await bell.click();
    await expect(panel.getByText("You're all caught up")).toBeVisible();
    await expect(bell).toHaveAttribute("aria-label", "Notifications");
    await expect(
      panel.getByText("No decisions waiting", { exact: true }),
    ).toBeVisible();
    expect(writes.filter(({ path }) => path.includes("/sync"))).toEqual([]);
    expect(
      writes.filter(({ path }) => path === "/api/steam/import"),
    ).toHaveLength(label === 'legacy wishlist' ? 1 : 2);
    expect(writes.filter(({ path }) => path === '/api/wishlist/9/move-to-backlog')).toHaveLength(label === 'legacy wishlist' ? 1 : 0);
    expect(errors).toEqual([]);
    await expect(page).toHaveURL(/\/wishlist$/);
    await panel
      .getByRole("button", { name: "Close notifications", exact: true })
      .click();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await page.getByRole("link", { name: "Steam sync settings" }).click();
    await expect(
      page.getByText("Daily Steam sync", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Automatic updates are off. Saved data stays available."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh Library", exact: true }),
    ).toBeVisible();
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bell).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`steam-settings-${label}.png`),
      fullPage: true,
    });
    expect(
      writes.filter(
        ({ path }) => path.includes("/sync") || path.includes("/account"),
      ),
    ).toEqual([]);
    await page.goto("/");
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bell).toBeFocused();
  });
}
