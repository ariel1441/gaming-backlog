import { expect, test } from '@playwright/test';

test('late personal genres cannot cross a logout and login', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'genre-a');
    localStorage.setItem('seen_onboarding_v1', '1');
    localStorage.setItem('gaming_backlog_sidebar_collapsed_v1', '0');
    const original = window.fetch;
    window.fetch = (url, options = {}) => {
      if (String(url).includes('/personal-genres') && new Headers(options.headers).get('Authorization') === 'Bearer genre-a') {
        window.oldGenresStarted = true;
        // Deliberately ignore cancellation to exercise the response identity fence too.
        return new Promise(resolve => { window.releaseOldGenres = () => resolve(new Response(JSON.stringify({ genres: [{ id: 1, name: 'Private A genre' }] }), { headers: { 'Content-Type': 'application/json' } })); });
      }
      return original(url, options);
    };
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const b = route.request().headers().authorization === 'Bearer genre-b';
    const user = { id: b ? 102 : 101, username: b ? 'genre-b' : 'genre-a', preferences: {} };
    const json = body => route.fulfill({ json: body });
    if (path === '/api/auth/me') return json(user);
    if (path === '/api/auth/login') return json({ token: 'genre-b', user: { ...user, id: 102, username: 'genre-b' } });
    if (path === '/api/personal-genres') return json({ genres: [{ id: 2, name: 'Private B genre' }] });
    if (path === '/api/games') return json([{ id: b ? 2 : 1, name: 'Test game', status: 'plan to play' }]);
    if (path === '/api/games/statuses-list') return json(['plan to play', 'playing', 'finished']);
    if (path === '/api/meta/status-groups') return json({ groups: { planned: ['plan to play'], playing: ['playing'], done: ['finished'], other: [] }, buckets: {} });
    if (path === '/api/activity/inbox') return json({ items: [], counts: {}, hasMore: false });
    if (path === '/api/steam/sync-health') return json({ account: null, activeJob: null, runs: [] });
    return json({});
  });
  await page.goto('/');
  await page.waitForFunction(() => window.oldGenresStarted);
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  await dialog.getByLabel('Username', { exact: true }).fill('genre-b');
  await dialog.getByLabel('Password', { exact: true }).fill('password123');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'My genres', exact: true }).click();
  await expect(page.getByText('Private B genre', { exact: true })).toBeVisible();
  await page.evaluate(async () => { window.releaseOldGenres(); await new Promise(resolve => setTimeout(resolve, 50)); });
  await expect(page.getByText('Private A genre', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Private B genre', { exact: true })).toBeVisible();
});
