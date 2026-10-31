import { expect, test } from '@playwright/test';

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  test(`saved health ${label}: summary polling, diagnostic upgrade and active progress`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.install();
    await page.addInitScript(() => {
      localStorage.setItem('token', 'health-fixture');
      localStorage.setItem('seen_onboarding_v1', '1');
    });
    const account = { id: 1, steamId: '76561190000000001', autoSyncEnabled: true,
      lastWishlistSyncAt: '2026-10-23T05:00:00Z', lastLibrarySyncAt: '2026-10-23T05:00:00Z', priceRevision: '1' };
    const requests = [], writes = [], errors = [];
    let activeJob = null, holdSummary = null, holdFull = null;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      if (request.method() !== 'GET') writes.push(path);
      const json = body => route.fulfill({ json: body });
      if (path === '/api/auth/me') return json({ id: 99, username: 'health-fixture', preferences: {} });
      if (path === '/api/meta/status-groups') return json({ groups: { planned: ['plan to play'], playing: ['playing'], done: ['finished'] }, buckets: {} });
      if (path === '/api/games') return json([]);
      if (path === '/api/games/statuses-list') return json(['plan to play', 'playing', 'finished']);
      if (path === '/api/personal-genres') return json({ genres: [] });
      if (path === '/api/steam/account') return json({ account });
      if (path === '/api/activity/inbox/counts') return json({ counts: { attention: 0, pendingDecisions: 0 } });
      if (path === '/api/wishlist') return json({ items: [], total: 0, account, priceRevision: account.priceRevision,
        snapshotVersion: '1', priceHealth: {}, metadata: {}, facets: {} });
      if (path === '/api/steam/sync-health') {
        const detail = url.searchParams.get('detail') || 'full';
        requests.push(detail);
        const payload = { account: { ...account }, activeJob: activeJob ? { ...activeJob } : null,
          ...(detail === 'full' ? { runs: [], lastScheduledAt: '2026-10-23T05:00:00Z', dailyRuns: [{
            id: 'diagnostic-run', startedAt: '2026-10-23T05:00:00Z', status: 'partial',
            errorMessage: 'Saved diagnostic fixture', summary: {},
          }] } : {}),
        };
        if (detail === 'summary' && holdSummary) await holdSummary;
        if (detail === 'full' && holdFull) await holdFull;
        return json(payload);
      }
      return json({});
    });
    await page.goto('/wishlist');
    await expect(page.getByRole('heading', { name: /wishlist$/i })).toBeVisible({ timeout: 15000 });
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    expect(requests.every(detail => detail === 'summary')).toBe(true);

    let releaseSummary;
    holdSummary = new Promise(resolve => { releaseSummary = resolve; });
    const beforeSummary = requests.length;
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect.poll(() => requests.length).toBe(beforeSummary + 1);
    if (label === 'mobile') await page.getByRole('button', { name: 'Filters and view', exact: true }).click();
    await page.getByRole('button', { name: 'Manage Steam Wishlist updates', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Steam sync settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\?section=integrations/);
    expect(requests.filter(detail => detail === 'full')).toHaveLength(0);
    holdSummary = null; releaseSummary();
    await expect(page.getByText('Saved diagnostic fixture', { exact: true })).toBeVisible({ timeout: 15000 });
    expect(requests.at(-1)).toBe('full');

    let releaseFull;
    holdFull = new Promise(resolve => { releaseFull = resolve; });
    activeJob = { id: 'saved-job', syncKind: 'library', status: 'running', processed: 3, total: 10 };
    const beforeFull = requests.length;
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect.poll(() => requests.length).toBe(beforeFull + 1);
    holdFull = null; releaseFull();
    await expect(page.getByText(/3 of 10 items processed/)).toBeVisible();
    activeJob = { ...activeJob, processed: 4 };
    const beforeProgress = requests.length;
    await page.clock.fastForward(5100);
    await expect.poll(() => requests.length).toBe(beforeProgress + 1);
    await expect(page.getByText(/4 of 10 items processed/)).toBeVisible();

    const beforeReturn = requests.length;
    account.priceRevision = '2';
    await page.goBack();
    await expect(page.getByRole('heading', { name: /wishlist$/i })).toBeVisible();
    await expect.poll(() => requests.length).toBeGreaterThan(beforeReturn);
    expect(requests.slice(beforeReturn).every(detail => detail === 'summary')).toBe(true);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
