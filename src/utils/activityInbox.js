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
  steam_played: "Played on Steam",
  steam_achievement_unlocked: "Achievement unlocked",
  steam_first_played: "First played",
  steam_returned: "Returned to the game",
  steam_added_to_library: "Added to Steam library",
};

export function activityLabel(event) {
  if (
    event.source === "steam_library" &&
    event.eventKind === "decision" &&
    event.state === "resolved"
  )
    return "Steam activity reviewed";
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
  const parts = [];
  const playedMinutes = events
    .filter((event) => event.eventType === "steam_played")
    .reduce((total, event) => {
      const minutes = Number(event.payload?.playtimeMinutes);
      return total + (Number.isFinite(minutes) && minutes > 0 ? minutes : 0);
    }, 0);
  if (playedMinutes > 0) {
    const hours = Math.floor(playedMinutes / 60);
    const minutes = playedMinutes % 60;
    const duration = [hours ? `${hours}h` : "", minutes ? `${minutes}m` : ""]
      .filter(Boolean)
      .join(" ");
    parts.push(`Played for ${duration}`);
  }
  const achievements = events.filter(
    (event) => event.eventType === "steam_achievement_unlocked",
  );
  if (achievements.length === 1) {
    parts.push(`Unlocked ${achievements[0].payload?.achievementName || "an achievement"}`);
  } else if (achievements.length > 1) {
    parts.push(`Unlocked ${achievements.length} achievements`);
  }
  for (const event of events) {
    if (["steam_played", "steam_achievement_unlocked"].includes(event.eventType)) continue;
    if (
      event.eventType === "steam_returned" &&
      Number(event.payload?.daysSincePrevious) >= 2
    ) {
      parts.push(`Returned after ${Number(event.payload.daysSincePrevious)} days`);
    } else {
      parts.push(activityLabel(event));
    }
  }
  return [...new Set(parts)].join(" · ");
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
  const discountLabel =
    p.sale === true && Number.isInteger(discount) && discount > 0
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
