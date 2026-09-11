import { test, expect } from "@playwright/test";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";

test("local PostgreSQL Wishlist renders real metadata and covers on desktop and mobile", async ({ page }) => {
  test.skip(process.env.STEAM_WISHLIST_LOCAL_SMOKE !== "1", "Opt-in read-only local database/browser inspection");
  test.setTimeout(60000);
  dotenv.config();
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(process.env.DATABASE_URL).hostname);
  const { pool } = await import("../../backend/db.js");
  pool.on("connect", (client) => { void client.query("SET default_transaction_read_only = on"); });
  let server;
  try {
    const users = await pool.query("SELECT DISTINCT account.user_id FROM user_external_accounts account JOIN steam_wishlist_items item ON item.user_id = account.user_id WHERE account.disconnected_at IS NULL AND item.is_active");
    expect(users.rows).toHaveLength(1);
    const userId = users.rows[0].user_id;
    const app = express();
    const { registerSecurity } = await import("../../backend/middleware/security.js");
    registerSecurity(app);
    app.use((req, res, next) => req.method === "GET" ? next() : res.sendStatus(405));
    const games = await import("../../backend/routes/games.js");
    await games.initLocalData(app);
    for (const [path, module] of [["auth", "auth"], ["wishlist", "wishlist"], ["games", "games"], ["meta", "meta"], ["personal-genres", "personalGenres"]]) {
      app.use(`/api/${path}`, (await import(`../../backend/routes/${module}.js`)).default);
    }
    app.use((req, res) => res.json({}));
    server = app.listen(5000);
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "5m" });
    await page.addInitScript((value) => { localStorage.setItem("token", value); localStorage.setItem("seen_onboarding_v1", "1"); }, token);
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    const { listWishlistItems } = await import("../../backend/services/steamWishlistService.js");
    const expected = await listWishlistItems(userId, { hltbLookup: app.locals.hltbLookup });
    expect(expected.items[0].providerOrder).toBe(0);
    const last = (await listWishlistItems(userId, { direction: "desc" })).items[0];
    for (const [width, label] of [[1440, "desktop"], [375, "mobile"]]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/wishlist");
      await expect(page.locator("article h3").first()).toHaveText(expected.items[0].name);
      const image = page.locator("article img").first();
      await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth > 0), { timeout: 20000 }).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `test-results/wishlist-local-${label}.png` });
      if (width < 768) await page.getByRole("button", { name: /Filters/ }).click();
      await page.getByRole("button", { name: /^Sort direction: ascending/ }).click();
      await expect(page.locator("article h3").first()).toHaveText(last.name);
    }
    expect(errors).toEqual([]);
  } finally {
    await new Promise((resolve) => server ? server.close(resolve) : resolve());
    await pool.end();
  }
});
