import { fetchProviderResponse, readProviderJson, providerHttpError, ProviderRequestError } from '../utils/providerFetch.js';

export const PRICE_NORMALIZER_VERSION = 1;
export const PRICE_BATCH_SIZE = 20;
// Bounded exceptions for public Steam offer labels inspected 2026-09-07.
// These only relax the label check: package contents and ILS money still verify.
// A changed package ID requires fresh review, not fuzzy name matching.
const reviewedLabelPackages = new Map(Object.entries({
  2351560: [844716, '清零计划2：天启派对  Project Zero 2: Apocalypse Party'],
  1718570: [615397, 'ASTLIBRA ～生きた証～'], 1664670: [591629, '重构'],
  1614440: [595063, 'Bo'], 335670: [55512, 'LISA'], 2068280: [738967, 'Nordic Ashes'],
  2108180: [753816, 'SWORDHAVEN'], 3265700: [1157163, 'Vampire Crawlers'],
  2827820: [1009353, 'The Relic: The First Guardian'],
  2131640: [762494, 'METAL GEAR SOLID 2: Sons of Liberty - Master Collection Version NA&EU'],
}));
const invalid = (message, code = 'steam_price_invalid') => new ProviderRequestError('steam', code, message, { retryable: false });
const money = value => value !== null && value !== undefined && /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const normalizedName = value => String(value || '').replace(/[™®]/g, '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/ (standard(?: edition)?|full version)$/, '');
const reviewedLabelMatches = (appId, option) => {
  const reviewed = reviewedLabelPackages.get(String(appId));
  return !!reviewed && reviewed[0] === Number(option.packageid) &&
    normalizedName(reviewed[1]) === normalizedName(option.purchase_option_name);
};
const baseOfferNameMatches = (offer, name) => normalizedName(offer) === normalizedName(name) ||
  normalizedName(offer) === normalizedName(String(name).replace(/(?:\s+Deluxe|:\s*[^:]+ Edition)$/i, ''));

// All price jobs in this worker share pacing, including retries and new users.
// Keep waits outside transactions; beforeRequest rechecks the lease afterwards.
export function createPriceRequestPacer({ intervalMs = 1500, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let nextAt = 0;
  return async () => {
    const slot = Math.max(now(), nextAt);
    nextAt = slot + intervalMs;
    const delay = slot - now();
    if (delay > 0) await sleep(delay);
  };
}
const paceRequest = createPriceRequestPacer({ intervalMs: process.env.NODE_ENV === 'test' ? 0 : 1500 });

export function selectSteamPriceOffer(item, appId) {
  if (Number(item?.success) !== 1 || String(item?.appid) !== String(appId)) throw invalid('Steam did not return a valid matching app.');
  if (item.unavailable_for_country_restriction === true) return { availability: 'unavailable' };
  const type = Number(item.type || 0);
  if (![0, 4].includes(type)) throw invalid('This listing is not a game or DLC.', 'steam_price_unsupported_type');
  if (item.visible !== true) throw invalid('The Steam listing is not visible.', 'steam_price_offer_uncertain');
  let option = item.best_purchase_option;
  // A discounted paid package, including a temporary 100% discount, is not F2P.
  if (item.is_free === true && !option) return { availability: 'free' };
  if (!option && item.release?.is_coming_soon === true) return { availability: 'unreleased' };
  const standard = candidate => candidate?.packageid && !candidate.bundleid && Number(candidate.included_game_count) === (type === 4 ? 0 : 1) &&
    !candidate.must_purchase_as_set && (!candidate.package_group || candidate.package_group === 'default') &&
    (baseOfferNameMatches(candidate.purchase_option_name, item.name) ||
      reviewedLabelMatches(appId, candidate)) &&
    !/\b(upgrade|soundtrack|subscription|season pass)\b/i.test(candidate.purchase_option_name);
  if (!standard(option)) {
    const candidates = [...new Map((Array.isArray(item.purchase_options) ? item.purchase_options : []).filter(standard).map(candidate => [candidate.packageid, candidate])).values()];
    if (candidates.length !== 1) throw invalid(`Steam did not provide one verified standard offer (${candidates.length} matching alternatives).`, 'steam_price_offer_uncertain');
    option = candidates[0];
  }
  return { availability: 'available', option };
}

export function normalizeSteamPrice(item, appId, packagePayload = null, observedAt = new Date().toISOString(), appDetails = null) {
  const selected = selectSteamPriceOffer(item, appId);
  const base = { country: 'IL', currency: null, offerId: null, offerName: item.name || null,
    availability: selected.availability, currentMinor: null, regularMinor: null, discountPercent: null,
    sale: null, observedAt, normalizerVersion: PRICE_NORMALIZER_VERSION,
    evidence: { provider: 'steam_store', country: 'IL', itemSuccess: item.success } };
  if (selected.availability === 'free') return { ...base, currency: 'ILS', offerId: `free:${appId}`,
    currentMinor: 0, regularMinor: 0, discountPercent: 0, sale: false,
    evidence: { ...base.evidence, isFree: true, currencyProvenance: 'IL_context_no_charge' } };
  if (!selected.option) return base;
  const option = selected.option;
  const response = packagePayload?.[String(option.packageid)];
  const data = response?.data;
  const apps = Array.isArray(data?.apps) ? data.apps : [];
  const target = apps.filter(app => String(app.id) === String(appId));
  const extras = apps.filter(app => String(app.id) !== String(appId));
  const relationship = appDetails?.[String(appId)];
  const relatedDlc = relationship?.success === true && relationship.data?.type === 'game' &&
    String(relationship.data.steam_appid) === String(appId) && Array.isArray(relationship.data.dlc)
    ? relationship.data.dlc.map(String) : [];
  if (response?.success !== true || target.length !== 1 || new Set(apps.map(app => String(app.id))).size !== apps.length ||
      (extras.length > 0 && (Number(item.type || 0) !== 0 || !extras.every(app => relatedDlc.includes(String(app.id))))) ||
      normalizedName(data.name) !== normalizedName(option.purchase_option_name) ||
      (target[0]?.name && normalizedName(target[0].name) !== normalizedName(item.name))) throw invalid('Steam package contents do not confirm the selected game.', 'steam_price_package_mismatch');
  const p = data.price;
  const current = money(p?.final), regular = money(p?.initial), discount = money(p?.discount_percent);
  if (p?.currency !== 'ILS') throw invalid('Steam did not confirm ILS pricing.', 'steam_price_currency_mismatch');
  if (current == null || regular == null || regular < current || discount == null || discount > 100 ||
      money(option.final_price_in_cents) !== current ||
      (option.original_price_in_cents != null && money(option.original_price_in_cents) !== regular) ||
      (option.discount_pct != null && money(option.discount_pct) !== discount) ||
      ((discount > 0) !== (regular > current)) ||
      (regular > 0 && Math.abs((1 - current / regular) * 100 - discount) > 1)) {
    throw invalid('Steam returned inconsistent price amounts.');
  }
  const hidden = option.hide_discount_pct_for_compliance === true || option.price_cannot_be_displayed_as_discount === true;
  return { ...base, currency: 'ILS', offerId: `package:${option.packageid}`, offerName: option.purchase_option_name,
    currentMinor: current, regularMinor: hidden ? null : regular, discountPercent: hidden ? null : discount,
    sale: hidden ? null : discount > 0,
    evidence: { ...base.evidence, packageId: option.packageid, packageApps: apps.map(app => String(app.id)),
      relatedDlc: extras.map(app => String(app.id)), reviewedLabel: reviewedLabelMatches(appId, option), currencyProvenance: 'package_price',
      discountHidden: hidden, activeDiscounts: option.active_discounts || [] } };
}

async function requestJson(url, beforeRequest) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await paceRequest();
    await beforeRequest();
    try {
      const response = await fetchProviderResponse('steam', url, { timeoutMs: 10000, maxBytes: 2 * 1024 * 1024, headers: { Accept: 'application/json' } });
      if (!response.ok) throw providerHttpError('steam', response);
      if (response.headers.get('x-eresult') && response.headers.get('x-eresult') !== '1') throw invalid('Steam rejected the price request.');
      return await readProviderJson('steam', response);
    } catch (error) {
      // Long waits belong in durable due state, not in the active worker.
      if (attempt === 2 || error.retryable === false || error.code === 'steam_rate_limited' || error.retryAfterMs > 2000) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.max(Number(error.retryAfterMs) || 0, 150 * 2 ** attempt)));
    }
  }
}

export async function fetchSteamPrices(appIds, { beforeRequest = async () => {} } = {}) {
  if (!appIds.length || appIds.length > PRICE_BATCH_SIZE || appIds.some(id => !/^[1-9][0-9]*$/.test(String(id)) || Number(id) > 4294967295)) throw invalid('Invalid price batch.');
  const url = new URL('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/');
  url.searchParams.set('input_json', JSON.stringify({ ids: appIds.map(appid => ({ appid: Number(appid) })),
    context: { country_code: 'IL', language: 'english', steam_realm: 1 }, data_request: { include_all_purchase_options: true, include_release: true } }));
  const results = [];
  let payload;
  try { payload = await requestJson(url, beforeRequest); }
  catch (error) { return appIds.map(appId => ({ appId, error })); }
  const items = payload?.response?.store_items;
  for (const appId of appIds) {
    try {
      const matching = Array.isArray(items) ? items.filter(item => String(item.appid) === String(appId)) : [];
      if (matching.length !== 1) throw invalid('Steam omitted or duplicated the requested app.');
      const item = matching[0];
      const selected = selectSteamPriceOffer(item, appId);
      let details = null, appDetails = null;
      if (selected.option) {
        const packageUrl = new URL('https://store.steampowered.com/api/packagedetails');
        packageUrl.search = new URLSearchParams({ packageids: String(selected.option.packageid), cc: 'il', l: 'english' }).toString();
        details = await requestJson(packageUrl, beforeRequest);
        const packageApps = details?.[String(selected.option.packageid)]?.data?.apps;
        if (Number(item.type || 0) === 0 && Array.isArray(packageApps) && packageApps.length > 1) {
          const appUrl = new URL('https://store.steampowered.com/api/appdetails');
          appUrl.search = new URLSearchParams({ appids: String(appId), cc: 'il', l: 'english' }).toString();
          appDetails = await requestJson(appUrl, beforeRequest);
        }
      }
      results.push({ appId, observation: normalizeSteamPrice(item, appId, details, new Date().toISOString(), appDetails) });
    } catch (error) {
      results.push({ appId, error });
      if (['steam_price_budget', 'steam_price_inactive', 'steam_rate_limited'].includes(error.code) || error.retryAfterMs > 2000) break;
    }
  }
  return results;
}

export function compareSteamPrices(previous, current) {
  if (!previous || previous.epoch !== current.epoch || previous.country !== current.country ||
      previous.currency !== current.currency || previous.offer_id !== current.offer_id ||
      previous.normalizer_version !== current.normalizer_version ||
      !['available', 'free'].includes(previous.availability) || !['available', 'free'].includes(current.availability)) return [];
  const events = [];
  if (Number(current.current_minor) < Number(previous.current_minor)) events.push('steam_price_drop');
  if (previous.sale === false && current.sale === true) events.push('steam_sale_started');
  return events;
}
