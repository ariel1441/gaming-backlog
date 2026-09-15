import crypto from 'node:crypto';
import {
  fetchProviderResponse,
  ProviderRequestError,
  providerHttpError,
  readProviderJson,
} from '../utils/providerFetch.js';

export const STEAM_PRICE_FEED_PAGE_SIZE = 50_000;
export const STEAM_PRICE_FEED_MAX_PAGES = 100;
export const STEAM_PRICE_FEED_OVERLAP_SECONDS = 5 * 60;
const STEAM_PRICE_FEED_URL = 'https://partner.steam-api.com/IStoreService/GetAppList/v1/';
const STEAM_TIMEOUT_MS = Number(process.env.STEAM_TIMEOUT_MS) || 10_000;
const STEAM_MAX_RESPONSE_BYTES = Math.max(Number(process.env.STEAM_MAX_RESPONSE_BYTES) || 5 * 1024 * 1024, 16 * 1024 * 1024);

const invalidFeed = (message, code = 'steam_price_feed_invalid_response') =>
  new ProviderRequestError('steam', code, message, { retryable: false });

function apiKey() {
  return String(process.env.STEAM_WEB_API_KEY || '').trim();
}

function positiveUint32(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 4_294_967_295) {
    throw invalidFeed(`Steam returned an invalid ${field}.`);
  }
  return number;
}

function appId(value) {
  const number = positiveUint32(value, 'appid');
  if (number < 1) throw invalidFeed('Steam returned an invalid appid.');
  return String(number);
}

function priceChangeNumber(value) {
  if (value == null || value === '') return null;
  const normalized = String(value);
  if (!/^\d+$/.test(normalized)) throw invalidFeed('Steam returned an invalid price_change_number.');
  return normalized;
}

export function normalizeSteamAppListPage(payload, { maxResults = STEAM_PRICE_FEED_PAGE_SIZE } = {}) {
  const response = payload?.response;
  if (!response || typeof response !== 'object' || Array.isArray(response) || !Array.isArray(response.apps)) {
    throw invalidFeed('Steam returned an invalid app-list response.');
  }
  const apps = response.apps.map((item) => ({
    appId: appId(item?.appid),
    lastModified: positiveUint32(item?.last_modified, 'last_modified'),
    priceChangeNumber: priceChangeNumber(item?.price_change_number),
  }));
  const lastAppId = response.last_appid == null
    ? (apps.length ? Number(apps[apps.length - 1].appId) : null)
    : Number(appId(response.last_appid));
  if (apps.length && lastAppId < Number(apps[apps.length - 1].appId)) {
    throw invalidFeed('Steam returned a page cursor before its final app.');
  }
  const haveMoreResults = response.have_more_results === true ||
    response.more_results === true ||
    (apps.length >= maxResults && lastAppId != null);
  return { apps, lastAppId, haveMoreResults };
}

async function fetchPage({ ifModifiedSince = 0, lastAppId = null, maxResults = STEAM_PRICE_FEED_PAGE_SIZE } = {}) {
  const key = apiKey();
  if (!key) throw new ProviderRequestError('steam', 'steam_price_feed_unconfigured', 'Steam API key is not configured.', { retryable: false });
  const url = new URL(STEAM_PRICE_FEED_URL);
  url.searchParams.set('key', key);
  const input = {
    include_games: true,
    include_dlc: false,
    include_software: false,
    include_videos: false,
    include_hardware: false,
    max_results: maxResults,
  };
  if (Number(ifModifiedSince) > 0) input.if_modified_since = Number(ifModifiedSince);
  if (lastAppId != null) input.last_appid = Number(lastAppId);
  url.searchParams.set('input_json', JSON.stringify(input));
  const response = await fetchProviderResponse('steam', url, {
    headers: { Accept: 'application/json' },
    timeoutMs: STEAM_TIMEOUT_MS,
    maxBytes: STEAM_MAX_RESPONSE_BYTES,
  });
  if (!response.ok) throw providerHttpError('steam', response);
  const result = response.headers.get('x-eresult');
  if (result != null && result !== '1') throw invalidFeed('Steam rejected the app-list request.', 'steam_price_feed_rejected');
  return normalizeSteamAppListPage(await readProviderJson('steam', response), { maxResults });
}

export async function fetchSteamPriceChangeFeed({ ifModifiedSince = 0, maxPages = STEAM_PRICE_FEED_MAX_PAGES, pageSize = STEAM_PRICE_FEED_PAGE_SIZE } = {}) {
  const changes = new Map();
  let lastAppId = null;
  let pages = 0;
  while (pages < maxPages) {
    const page = await fetchPage({ ifModifiedSince, lastAppId, maxResults: pageSize });
    pages += 1;
    for (const item of page.apps) {
      const prior = changes.get(item.appId);
      if (!prior || item.lastModified > prior.lastModified ||
          (item.lastModified === prior.lastModified && item.priceChangeNumber !== prior.priceChangeNumber)) {
        changes.set(item.appId, item);
      }
    }
    if (!page.haveMoreResults) return { pages, apps: [...changes.values()] };
    if (page.lastAppId == null || page.lastAppId === lastAppId) {
      throw invalidFeed('Steam did not provide a forward app-list cursor.');
    }
    lastAppId = page.lastAppId;
  }
  throw new ProviderRequestError('steam', 'steam_price_feed_incomplete', 'Steam app-list pagination exceeded the safety limit.');
}

export function createSteamPriceFeedLeaseToken() {
  return crypto.randomUUID();
}
