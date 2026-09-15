export function currentSteamPrice(price, now = Date.now()) {
  if (!price?.monitoring || price.stale || price.errorCode || !['available', 'free'].includes(price.status) ||
      price.currency !== 'ILS' || !Number.isSafeInteger(price.currentMinor) || price.currentMinor < 0 ||
      !price.observedAt || !Number.isFinite(Date.parse(price.observedAt)) || now - Date.parse(price.observedAt) > 36 * 60 * 60 * 1000) return null;
  return price.currentMinor;
}

export function isSteamSale(price, now = Date.now()) {
  return currentSteamPrice(price, now) != null && price.discountPercent > 0 && price.regularMinor > price.currentMinor;
}

export function relativeSavedTime(value, now = Date.now()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Not checked yet';
  const days = Math.floor(Math.max(0, now - time) / 86_400_000);
  return days === 0 ? 'Updated today' : days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`;
}

export function steamPriceDisplay(price, now = Date.now()) {
  if (!price) return null;
  const format = amount => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'ILS' }).format(amount / 100);
  const hasPrice = Number.isSafeInteger(price.currentMinor) && price.currentMinor >= 0 && price.currency === 'ILS';
  const historical = price.stale || !price.monitoring || price.status === 'not_checked' || price.status === 'failed' ||
    (price.observedAt && now - Date.parse(price.observedAt) > 36 * 60 * 60 * 1000);
  const labels = { unavailable: 'Unavailable in Israel', unreleased: 'Not yet available', not_checked: 'Price not checked', failed: 'Price refresh failed' };
  let label = labels[price.status] || 'Price unavailable';
  if (hasPrice && ['available', 'free', 'failed'].includes(price.status)) {
    label = price.availability === 'free' ? 'Free' : format(price.currentMinor);
  }
  const observed = price.observedAt ? new Date(price.observedAt) : null;
  const validDate = observed && Number.isFinite(observed.getTime());
  const stale = historical || (validDate && now - observed.getTime() > 36 * 60 * 60 * 1000);
  return { label, stale, regular: hasPrice && price.regularMinor > price.currentMinor && price.discountPercent > 0 ? format(price.regularMinor) : null,
    discount: hasPrice && price.discountPercent > 0 ? `${price.discountPercent}% off` : null,
    freshness: validDate ? relativeSavedTime(price.observedAt, now) : 'No successful price observation',
    note: price.monitoringReason === 'owned' ? 'Owned · monitoring stopped' : price.monitoringReason === 'identity_unresolved' ? 'Steam identity needs verification'
      : !price.monitoring ? 'Monitoring paused' : price.errorCode === 'steam_price_offer_uncertain' ? 'Standard offer needs verification'
      : price.errorCode === 'steam_price_package_mismatch' ? 'Package contents need verification'
      : price.errorCode === 'steam_price_unsupported_type' ? 'This content type is not supported for pricing'
      : price.errorCode === 'steam_rate_limited' ? 'Steam rate limit reached; waiting to retry'
      : price.checkState === 'awaiting_scheduled_check' ? 'Awaiting scheduled price check'
      : price.status === 'failed' ? (hasPrice ? 'Refresh failed; saved price retained' : 'Refresh failed; no price saved yet')
      : price.status === 'not_checked' ? 'Waiting for a price refresh' : stale ? 'Price may be out of date' : null,
    lastKnown: !hasPrice && price.lastKnown?.currency === 'ILS' && Number.isSafeInteger(price.lastKnown.currentMinor)
      ? `Last known: ${format(price.lastKnown.currentMinor)}` : null };
}

export function priceSyncMessage(summary = {}) {
  const counts = `${summary.succeeded || 0} prices refreshed, ${summary.failed || 0} failed, ${summary.deferred || 0} still waiting.` +
    (summary.pendingRetries > (summary.failed || 0) ? ` ${summary.pendingRetries} earlier failures await retry.` : '');
  if (summary.reason === 'provider_cooldown') return `${counts} Steam cooldown${summary.cooldownUntil ? ` until ${new Date(summary.cooldownUntil).toLocaleString()}` : ''}.`;
  if (summary.reason === 'request_budget') return `${counts} Run limit reached; remaining work stays due for a later run.`;
  if (summary.priceMode === 'fallback') return `${counts} Bulk price changes could not be checked; adaptive safety checks are scheduled.`;
  if (summary.priceMode === 'delta' && summary.feedChangedCandidates && !summary.succeeded && !summary.failed) {
    return `${counts} Steam reported changes, but none matched your Wishlist prices.`;
  }
  if (summary.reason === 'nothing_due') return 'No prices are due for refresh. Saved prices are unchanged.';
  return counts;
}
