import test from 'node:test';
import assert from 'node:assert/strict';
import { steamPriceDisplay, priceSyncMessage } from './steamPrice.js';

test('partial and cooldown feedback exposes counts and never claims all prices succeeded', () => {
  const message = priceSyncMessage({ succeeded: 198, failed: 26, deferred: 206, reason: 'provider_cooldown', cooldownUntil: '2026-09-07T22:46:00Z' });
  assert.match(message, /198 prices refreshed, 26 failed, 206 still waiting/);
  assert.match(message, /cooldown until/);
  assert.match(priceSyncMessage({ reason: 'request_budget', deferred: 20 }), /remaining work stays due for a later run/);
  assert.match(priceSyncMessage({ priceMode: 'fallback', succeeded: 0, failed: 0, deferred: 0 }), /adaptive safety checks/);
  assert.match(priceSyncMessage({ priceMode: 'delta', feedChangedCandidates: 2, reason: 'nothing_due' }), /none matched/);
  assert.equal(steamPriceDisplay({ monitoring: true, status: 'failed', currentMinor: null }).note, 'Refresh failed; no price saved yet');
});
import { composeBacklogWishlist } from '../pages/Wishlist/wishlistPresentation.js';

const price = { currency: 'ILS', country: 'IL', currentMinor: 500, regularMinor: 1000, discountPercent: 50,
  status: 'available', availability: 'available', monitoring: true, monitoringReason: 'eligible', observedAt: '2026-09-06T12:00:00Z' };
test('prices distinguish zero, unknown, failed, stale, owned and unavailable', () => {
  assert.equal(steamPriceDisplay(null), null);
  assert.equal(steamPriceDisplay(price, Date.parse(price.observedAt)).discount, '50% off');
  assert.equal(steamPriceDisplay({ ...price, currency: 'USD' }).label, 'Price unavailable');
  assert.equal(steamPriceDisplay({ ...price, currentMinor: null, status: 'not_checked' }).label, 'Price not checked');
  assert.match(steamPriceDisplay({ ...price, currentMinor: 0, availability: 'free', status: 'free' }).label, /Free/);
  assert.doesNotMatch(steamPriceDisplay({ ...price, status: 'failed' }).label, /Last known/);
  assert.match(steamPriceDisplay({ ...price, status: 'failed' }).note, /saved price retained/);
  assert.match(steamPriceDisplay({ ...price, monitoring: false, monitoringReason: 'owned' }).note, /Owned/);
  assert.equal(steamPriceDisplay({ ...price, checkState: 'awaiting_scheduled_check' }).note, 'Awaiting scheduled price check');
  assert.equal(steamPriceDisplay({ ...price, currentMinor: null, status: 'unavailable' }).label, 'Unavailable in Israel');
  assert.equal(steamPriceDisplay(price, Date.parse(price.observedAt) + 2 * 86400000).stale, true);
});
test('price metadata remains in presentation projections and deduplicates ordinary games', () => {
  const games = [{ id: 9, name: 'Ordinary', status: 'playing' }];
  const result = composeBacklogWishlist(games, [
    { id: 1, gameId: 9, active: true, steamPrice: price },
    { id: 2, active: true, steamPrice: price },
  ]);
  assert.equal(result.length, 2); assert.equal(result[0].wishlist.steamPrice, price);
  assert.equal(result[1].steamPrice, price); assert.equal(result[1].readOnly, true);
  assert.equal(games[0].wishlist, undefined);
});
