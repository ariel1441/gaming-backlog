const labels = {
  steam_price_drop: "Price drop",
  steam_price_increase: "Price increased",
  steam_sale_started: "New sale",
  steam_sale_ended: "Sale ended",
  wishlist_added: "Added to Steam Wishlist",
  wishlist_removed: "Removed from Steam Wishlist",
  wishlist_likely_purchased: "Removed from Steam Wishlist",
  wishlist_priority_changed: "Steam order changed",
  steam_new_game: "New ownership observed",
  steam_started_playing: "Play activity observed",
  steam_status_suggestion: "Status may need updating",
};
export function activityLabel(event) {
  if (event.source === 'steam_library' && event.state === 'resolved') return 'Steam activity reviewed';
  if (
    event.nowOwned &&
    ["wishlist_removed", "wishlist_likely_purchased"].includes(event.eventType)
  )
    return "Now owned · removed from Steam Wishlist";
  return labels[event.eventType] || "Steam update";
}

export function activitySummary(events = []) {
  const priceEvents = events.filter((event) => event.source === "steam_prices");
  if (priceEvents.length) {
    if (priceEvents.some((event) => event.eventType === "steam_sale_started"))
      return "New sale";
    if (priceEvents.some((event) => event.eventType === "steam_price_drop"))
      return "Price drop";
    if (priceEvents.some((event) => event.eventType === "steam_sale_ended"))
      return "Sale ended";
    if (priceEvents.some((event) => event.eventType === "steam_price_increase"))
      return "Price increased";
  }
  return [...new Set(events.map(activityLabel))].join(" · ");
}

export function activityPriceChange(event) {
  const p = event.payload;
  if (
    event.source !== "steam_prices" ||
    p?.currency !== "ILS" ||
    !Number.isSafeInteger(p.previousMinor) ||
    !Number.isSafeInteger(p.currentMinor)
  )
    return null;
  const money = (value) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "ILS",
    }).format(value / 100);
  const discount = Number(p.discountPercent);
  const discountLabel = p.sale === true && Number.isInteger(discount) && discount > 0
    ? `${discount}% off · `
    : "";
  return `${discountLabel}${money(p.previousMinor)} → ${money(p.currentMinor)}`;
}

export function groupActivityDigests(groups = []) {
  const digests = new Map();
  for (const group of groups) {
    const event = group.events[0];
    const key = `${event?.source}:${event?.syncRunId || group.id}`;
    if (!digests.has(key))
      digests.set(key, {
        key,
        source: event?.source,
        observedAt: group.observedAt,
        groups: [],
      });
    digests.get(key).groups.push(group);
  }
  return [...digests.values()];
}
