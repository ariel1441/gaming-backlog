import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSteamPrice, selectSteamPriceOffer, compareSteamPrices, fetchSteamPrices, createPriceRequestPacer } from './steamPriceProvider.js';

test('verified standard package naming differences do not reject the correct AppID', () => {
  for (const [name, offer] of [['Tyranny', 'Tyranny - Standard Edition'], ['Tom Clancy’s The Division™', "Tom Clancy's The Division"],
    ['Battle Chef Brigade Deluxe', 'Battle Chef Brigade'], ['Blade and Sorcery', 'Blade & Sorcery'], ['Bad North: Jotunn Edition', 'Bad North'],
    ['Fear & Hunger', 'Fear & Hunger - Full Version'], ['GetsuFumaDen: Undying Moon', 'GetsuFumaDen: Undying Moon Standard'], ['The Séance of Blake Manor', 'The Seance of Blake Manor']]) {
    const item = app({ name }); item.best_purchase_option.purchase_option_name = offer;
    const p = details(); p['7877'].data.name = offer; p['7877'].data.apps[0].name = name;
    assert.equal(normalizeSteamPrice(item, 620, p).currentMinor, 3695);
    p['7877'].data.apps[0].id = 999;
    assert.throws(() => normalizeSteamPrice(item, 620, p), /contents/);
  }
});

test('a best-offer bundle cannot hide a separately verified standard package or select a partial edition', () => {
  const item = app(); const standard = item.best_purchase_option;
  item.best_purchase_option = { bundleid: 123, purchase_option_name: 'Portal bundle', included_game_count: 2 };
  item.purchase_options = [item.best_purchase_option, standard];
  assert.equal(normalizeSteamPrice(item, 620, details()).offerId, 'package:7877');
  item.purchase_options.push({ ...standard, packageid: 999 });
  assert.throws(() => normalizeSteamPrice(item, 620, details()), /standard offer/);
  item.purchase_options = [{ ...standard, purchase_option_name: 'Portal 2 Part One' }];
  assert.throws(() => normalizeSteamPrice(item, 620, details()), /standard offer/);
  assert.throws(() => selectSteamPriceOffer(app({ type: 4 }), 620), /standard offer/);
});

test('request pacing reserves separate slots including concurrent callers', async () => {
  let clock = 0; const waits = [];
  const pace = createPriceRequestPacer({ intervalMs: 1500, now: () => clock, sleep: async ms => { waits.push(ms); } });
  await Promise.all([pace(), pace(), pace()]);
  assert.deepEqual(waits, [1500, 3000]);
  clock = 10000; await pace(); assert.equal(waits.length, 2);
});

// Public IL samples checked 2026-09-06: Portal 2 package 7877 and Bodycam
// package 866042. Fixture values are contract evidence, not current quotations.
const app = (changes = {}) => ({ appid: 620, success: 1, visible: true, name: 'Portal 2',
  best_purchase_option: { packageid: 7877, purchase_option_name: 'Portal 2', included_game_count: 1, final_price_in_cents: '3695' }, ...changes });
const details = (price = {}) => ({ '7877': { success: true, data: { name: 'Portal 2', apps: [{ id: 620 }],
  price: { currency: 'ILS', initial: 3695, final: 3695, discount_percent: 0, ...price } } } });

test('reviewed localized labels require the exact package, label and game contents', () => {
  const samples = [
    [2351560, 844716, 'Apocalypse Party', '清零计划2：天启派对  Project Zero 2: Apocalypse Party'],
    [1718570, 615397, 'ASTLIBRA Revision', 'ASTLIBRA ～生きた証～'],
    [1664670, 591629, 'Refactor', '重构'], [1614440, 595063, 'Bō: Path of the Teal Lotus', 'Bo'],
    [335670, 55512, 'LISA: The Painful', 'LISA'], [2068280, 738967, 'Nordic Ashes: Survivors of Ragnarok', 'Nordic Ashes'],
    [2108180, 753816, 'Swordhaven: Iron Conspiracy', 'SWORDHAVEN'],
    [3265700, 1157163, 'Vampire Crawlers: The Turbo Wildcard from Vampire Survivors', 'Vampire Crawlers'],
    [2827820, 1009353, 'The Relic: First Guardian', 'The Relic: The First Guardian'],
    [2131640, 762494, 'METAL GEAR SOLID 2: Sons of Liberty - Master Collection Version', 'METAL GEAR SOLID 2: Sons of Liberty - Master Collection Version NA&EU'],
  ];
  for (const [appid, packageid, name, offer] of samples) {
    const item = app({ appid, name });
    Object.assign(item.best_purchase_option, { packageid, purchase_option_name: offer });
    const data = { ...details()['7877'].data, name: offer, apps: [{ id: appid, name }] };
    const p = { [packageid]: { success: true, data } };
    assert.equal(normalizeSteamPrice(item, appid, p).evidence.reviewedLabel, true);
    data.apps[0].id = 999;
    assert.throws(() => normalizeSteamPrice(item, appid, p), /contents/);
    data.apps[0].id = appid;
    item.best_purchase_option.packageid = 999;
    assert.throws(() => normalizeSteamPrice(item, appid, p), /standard offer/);
    item.best_purchase_option.packageid = packageid;
    item.best_purchase_option.purchase_option_name = `${offer} Gold Edition`;
    assert.throws(() => normalizeSteamPrice(item, appid, p), /standard offer/);
  }
});

test('base packages accept only corroborated child DLC and preserve money validation', () => {
  const p = details(); p['7877'].data.apps.push({ id: 621, name: 'Portal DLC' });
  const related = { 620: { success: true, data: { steam_appid: 620, type: 'game', dlc: [621] } } };
  const normalize = evidence => normalizeSteamPrice(app(), 620, p, undefined, evidence);
  assert.deepEqual(normalize(related).evidence.packageApps, ['620', '621']);
  for (const evidence of [null, { 620: { success: false } },
    { 620: { success: true, data: { steam_appid: 999, type: 'game', dlc: [621] } } },
    { 620: { success: true, data: { steam_appid: 620, type: 'game', dlc: [999] } } }]) {
    assert.throws(() => normalize(evidence), /contents/);
  }
  p['7877'].data.price.currency = 'USD';
  assert.throws(() => normalize(related), /ILS/);
  p['7877'].data.price.currency = 'ILS';
  p['7877'].data.apps.push({ id: 999, name: 'Unrelated game' });
  assert.throws(() => normalize(related), /contents/);
});

test('standalone DLC is priced by its own AppID; unreleased DLC is unknown, not zero', () => {
  const item = app({ type: 4 }); item.best_purchase_option.included_game_count = 0;
  assert.equal(normalizeSteamPrice(item, 620, details()).currentMinor, 3695);
  const p = details(); p['7877'].data.apps.push({ id: 999 });
  assert.throws(() => normalizeSteamPrice(item, 620, p), /contents/);
  const unreleased = normalizeSteamPrice(app({ type: 4, best_purchase_option: undefined, release: { is_coming_soon: true } }), 620);
  assert.equal(unreleased.availability, 'unreleased'); assert.equal(unreleased.currentMinor, null);
  assert.throws(() => normalizeSteamPrice(app({ type: 4, best_purchase_option: undefined }), 620), /standard offer/);
  assert.throws(() => normalizeSteamPrice(app({ type: 11 }), 620), /not a game or DLC/);
});

test('DLC relationship requests use IL and the same request budget/fencing callback', async () => {
  const original = globalThis.fetch; let reserved = 0;
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (url.pathname.includes('GetItems')) return Response.json({ response: { store_items: [app()] } });
      assert.equal(url.searchParams.get('cc'), 'il');
      if (url.pathname.includes('packagedetails')) {
        const p = details(); p['7877'].data.apps.push({ id: 621 }); return Response.json(p);
      }
      assert.equal(url.searchParams.get('appids'), '620');
      return Response.json({ 620: { success: true, data: { steam_appid: 620, type: 'game', dlc: [621] } } });
    };
    const [result] = await fetchSteamPrices(['620'], { beforeRequest: async () => { reserved++; } });
    assert.equal(reserved, 3); assert.equal(result.observation.currentMinor, 3695);
    reserved = 0;
    const [stopped] = await fetchSteamPrices(['620'], { beforeRequest: async () => {
      if (++reserved === 3) throw Object.assign(new Error('budget'), { code: 'steam_price_budget' });
    } });
    assert.equal(stopped.error.code, 'steam_price_budget');
  } finally { globalThis.fetch = original; }
});

test('IL package money and exact identity corroborate omitted undiscounted fields', () => {
  const o = normalizeSteamPrice(app(), '620', details());
  assert.equal(o.currency, 'ILS'); assert.equal(o.regularMinor, 3695); assert.equal(o.sale, false);
  assert.equal(o.offerId, 'package:7877');
  assert.throws(() => normalizeSteamPrice(app(), '620', details({ currency: 'USD' })), /ILS/);
});

test('real discounted field shape produces price/sale evidence and honors hidden discount flags', () => {
  const item = app({ appid: 2406770, name: 'Bodycam', best_purchase_option: { packageid: 866042, purchase_option_name: 'Bodycam',
    included_game_count: 1, final_price_in_cents: '10556', original_price_in_cents: '13195', discount_pct: 20 } });
  const p = { '866042': { success: true, data: { name: 'Bodycam', apps: [{ id: 2406770 }],
    price: { currency: 'ILS', initial: 13195, final: 10556, discount_percent: 20 } } } };
  assert.equal(normalizeSteamPrice(item, 2406770, p).sale, true);
  item.best_purchase_option.hide_discount_pct_for_compliance = true;
  const hidden = normalizeSteamPrice(item, 2406770, p);
  assert.equal(hidden.sale, null); assert.equal(hidden.regularMinor, null);
});

test('missing prices, fractional, unsafe, mismatched or contradictory values never become zero', () => {
  for (const price of [{ final: null }, { final: 1.2 }, { final: '9007199254740992' }, { initial: 1 }, { discount_percent: 20 }]) {
    assert.throws(() => normalizeSteamPrice(app(), 620, details(price)), /inconsistent/);
  }
});

test('F2P, temporary free, preorder and explicit country restriction remain distinct', () => {
  const free = normalizeSteamPrice(app({ is_free: true, best_purchase_option: undefined }), 620);
  assert.equal(free.availability, 'free'); assert.equal(free.currentMinor, 0);
  const temporary = app(); temporary.best_purchase_option.final_price_in_cents = '0';
  const o = normalizeSteamPrice(temporary, 620, details({ final: 0, discount_percent: 100 }));
  assert.equal(o.availability, 'available'); assert.equal(o.sale, true);
  assert.equal(normalizeSteamPrice(app({ best_purchase_option: undefined, release: { is_coming_soon: true } }), 620).availability, 'unreleased');
  assert.equal(normalizeSteamPrice(app({ unavailable_for_country_restriction: true }), 620).availability, 'unavailable');
  assert.throws(() => normalizeSteamPrice(app({ best_purchase_option: undefined }), 620), /standard offer/);
});

test('generic failure, wrong app, bundles, alternate editions, upgrades and package contents are rejected', () => {
  assert.throws(() => selectSteamPriceOffer(app({ appid: 0, success: 15 }), 620));
  for (const change of [{ bundleid: 234 }, { purchase_option_name: 'Portal 2 - The Final Hours' },
    { purchase_option_name: 'Portal 2 Deluxe' }, { included_game_count: 2 }, { must_purchase_as_set: true }]) {
    const item = app(); Object.assign(item.best_purchase_option, change);
    assert.throws(() => normalizeSteamPrice(item, 620, details()), /standard offer/);
  }
  const wrong = details(); wrong['7877'].data.apps = [{ id: 999 }];
  assert.throws(() => normalizeSteamPrice(app(), 620, wrong), /contents/);
});

test('only compatible observations create events, including repeated genuine sale cycles', () => {
  const old = { epoch: 'a', country: 'IL', currency: 'ILS', offer_id: 'package:1', normalizer_version: 1,
    availability: 'available', current_minor: '1000', sale: false };
  const sale = { ...old, current_minor: '500', sale: true };
  assert.deepEqual(compareSteamPrices(null, sale), []);
  assert.deepEqual(compareSteamPrices(old, old), []);
  assert.deepEqual(compareSteamPrices(old, sale), ['steam_price_drop', 'steam_sale_started']);
  assert.deepEqual(compareSteamPrices(sale, old), []);
  for (const change of [{ epoch: 'b' }, { country: 'US' }, { currency: 'USD' }, { offer_id: 'package:2' },
    { normalizer_version: 2 }, { availability: 'unavailable' }]) assert.deepEqual(compareSteamPrices(old, { ...sale, ...change }), []);
  assert.deepEqual(compareSteamPrices({ ...old, sale: null }, sale), ['steam_price_drop']);
});

test('provider requests IL explicitly, matches IDs rather than position, and bounds retries', async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input)); calls.push(url);
      if (url.pathname.includes('GetItems')) {
        assert.equal(JSON.parse(url.searchParams.get('input_json')).context.country_code, 'IL');
        return Response.json({ response: { store_items: [app({ appid: 0, success: 15 }), app()] } });
      }
      assert.equal(url.searchParams.get('cc'), 'il');
      return Response.json(details());
    };
    const result = await fetchSteamPrices(['999', '620']);
    assert.ok(result[0].error); assert.equal(result[1].observation.currentMinor, 3695);
    assert.equal(calls.length, 2);
    let reserved = 0;
    globalThis.fetch = async () => new Response('failure', { status: 503 });
    const failed = await fetchSteamPrices(['620'], { beforeRequest: async () => { reserved++; } });
    assert.equal(reserved, 3); assert.ok(failed[0].error);
    globalThis.fetch = async () => new Response('slow down', { status: 429, headers: { 'Retry-After': '3600' } });
    const limited = await fetchSteamPrices(['620']);
    assert.equal(limited[0].error.retryAfterMs, 3600000);
  } finally { globalThis.fetch = original; }
});
