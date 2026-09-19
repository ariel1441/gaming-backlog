import { expect, test } from '@playwright/test';

for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
  test(`Steam Israel prices preserve ${label} Wishlist views and recovery`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = [], mutations = [];
    let refreshCount = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('token', 'price-test'); localStorage.setItem('seen_onboarding_v1', '1'); });
    const observedAt = new Date().toISOString();
    const base = { country: 'IL', currency: 'ILS', currentMinor: 500, regularMinor: 1000, discountPercent: 50,
      status: 'available', availability: 'available', monitoring: true, monitoringReason: 'eligible', observedAt };
    const items = [
      { id: 1, steamAppId: '620', name: 'A very long Wishlist title with no cover that remains readable on a small screen', steamPrice: base },
      { id: 2, steamAppId: '570', name: 'Free game', steamPrice: { ...base, currentMinor: 0, regularMinor: 0, discountPercent: 0, status: 'free', availability: 'free' } },
      { id: 3, steamAppId: '100', name: 'Stale game', steamPrice: { ...base, status: 'failed', stale: true, observedAt: '2026-01-01T12:00:00Z' } },
    ].map((item, index) => ({ ...item, active: true, steamActive: true, providerOrder: index, genres: ['Adventure'], metadataComplete: true, cover: null }));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const json = body => route.fulfill({ json: body });
      if (route.request().method() !== 'GET') mutations.push(path);
      if (path === '/api/auth/me') return json({ id: 99, username: 'prices', preferences: { show_wishlist_in_backlog: true } });
      if (path === '/api/meta/status-groups') return json({ groups: { planned: [], playing: [], done: [], other: [] }, buckets: {} });
      if (path === '/api/games' || path === '/api/games/statuses-list') return json([]);
      if (path === '/api/wishlist') return json({ items, total: items.length, snapshotVersion: 'membership-1', priceRevision: '1',
        account: { id: 1, wishlistSyncStatus: 'synced', priceSyncStatus: 'partial', lastPriceSyncAt: observedAt,
          priceNextAttemptAt: refreshCount > 1 ? new Date(Date.now() + 3600000).toISOString() : null },
        priceHealth: { eligible: 3, observed: 3, failed: 1, unchecked: 0, unresolved: 0, last_observation_at: observedAt }, metadata: {} });
      if (path === '/api/wishlist/prices/sync') { refreshCount++; return json({ job: { id: 'price-job', status: 'queued' } }); }
      if (path === '/api/steam/sync/price-job') return json({ job: { id: 'price-job', status: 'completed', result: refreshCount > 1
        ? { summary: { succeeded: 0, failed: 0, deferred: 2, reason: 'provider_cooldown' }, run: { status: 'partial' } }
        : { summary: { succeeded: 3 }, run: { status: 'succeeded' } } } });
      return json({});
    });
    await page.goto('/wishlist');
    const displayedPrices = page.getByTestId('steam-price');
    await expect(displayedPrices).toHaveCount(3);
    await expect(page.getByText('50% off').first()).toBeVisible();
    await expect(page.getByText('Free', { exact: true })).toBeVisible();
    await expect(page.getByText('Refresh failed; saved price retained')).toHaveCount(0);
    if (label === 'mobile') await page.getByRole('button', { name: 'Filters and view', exact: true }).click();
    for (const name of ['Compact cards', 'Rows', 'Table', 'Cards']) {
      await page.getByTitle(name, { exact: true }).click();
      await expect(displayedPrices).toHaveCount(3);
    }
    const manageUpdates = page.getByRole('button', { name: 'Manage Steam Wishlist updates', exact: true });
    await manageUpdates.click();
    await page.getByRole('menuitem', { name: 'Refresh prices', exact: true }).click();
    await expect(page.getByText('3 prices refreshed, 0 failed, 0 still waiting.')).toBeVisible();
    expect(mutations).toEqual(['/api/wishlist/prices/sync']);
    await manageUpdates.click();
    await page.getByRole('menuitem', { name: 'Refresh prices', exact: true }).click();
    await expect(page.getByText('0 prices refreshed, 0 failed, 2 still waiting. Steam cooldown.')).toBeVisible();
    await manageUpdates.click();
    await expect(page.getByRole('menuitem', { name: 'Steam sync settings' })).toBeVisible();
    await expect(page.getByText(/1 price needs attention/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`prices-${label}.png`), fullPage: true });
    await page.goto('/');
    await expect(page.getByTestId('steam-price')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
}
