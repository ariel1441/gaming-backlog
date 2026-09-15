import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSteamPriceChangeFeed, normalizeSteamAppListPage } from './steamPriceFeedProvider.js';

const response = body => Response.json(body, { headers: { 'x-eresult': '1' } });

test('Steam price feed uses the server key, paginates by appid, and deduplicates overlap', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.STEAM_WEB_API_KEY;
  const calls = [];
  process.env.STEAM_WEB_API_KEY = 'fixture-key';
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      calls.push(url);
      assert.equal(url.hostname, 'partner.steam-api.com');
      assert.equal(url.searchParams.get('key'), 'fixture-key');
      const request = JSON.parse(url.searchParams.get('input_json'));
      assert.equal(request.max_results, 50_000);
      assert.equal(request.include_games, true);
      assert.equal(request.include_dlc, false);
      if (!request.last_appid) {
        assert.equal(request.if_modified_since, 95);
        return response({ response: { apps: [
          { appid: 1, last_modified: 100, price_change_number: '7' },
          { appid: 2, last_modified: 101, price_change_number: '8' },
        ], last_appid: 2, have_more_results: true } });
      }
      assert.equal(request.if_modified_since, 95);
      assert.equal(request.last_appid, 2);
      return response({ response: { apps: [
        { appid: 2, last_modified: 102, price_change_number: '9' },
        { appid: 3, last_modified: 103, price_change_number: '10' },
      ], last_appid: 3, have_more_results: false } });
    };
    const result = await fetchSteamPriceChangeFeed({ ifModifiedSince: 95 });
    assert.equal(result.pages, 2);
    assert.deepEqual(result.apps, [
      { appId: '1', lastModified: 100, priceChangeNumber: '7' },
      { appId: '2', lastModified: 102, priceChangeNumber: '9' },
      { appId: '3', lastModified: 103, priceChangeNumber: '10' },
    ]);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.STEAM_WEB_API_KEY;
    else process.env.STEAM_WEB_API_KEY = originalKey;
  }
});

test('Steam price feed rejects malformed cursors and incomplete pagination', async () => {
  assert.throws(() => normalizeSteamAppListPage({ response: { apps: [{ appid: 0, last_modified: 1 }] } }), /appid/);
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.STEAM_WEB_API_KEY;
  process.env.STEAM_WEB_API_KEY = 'fixture-key';
  try {
    globalThis.fetch = async () => response({ response: { apps: [{ appid: 1, last_modified: 1 }], last_appid: 1, have_more_results: true } });
    await assert.rejects(fetchSteamPriceChangeFeed({ maxPages: 1 }), error => error.code === 'steam_price_feed_incomplete');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.STEAM_WEB_API_KEY;
    else process.env.STEAM_WEB_API_KEY = originalKey;
  }
});

test('Steam price feed leaves provider failures visible to the fallback caller', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.STEAM_WEB_API_KEY;
  process.env.STEAM_WEB_API_KEY = 'fixture-key';
  try {
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    await assert.rejects(fetchSteamPriceChangeFeed(), error => error.code === 'steam_http_error');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.STEAM_WEB_API_KEY;
    else process.env.STEAM_WEB_API_KEY = originalKey;
  }
});
