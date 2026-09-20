export function notificationCategory(group) {
  const events = group.events || [];
  if (
    events.some(
      (event) => event.source === "steam_library" && event.state === "open",
    )
  ) {
    if (events.some((event) => event.gameId || event.payload?.gameId))
      return "playing";
    return events.some((event) => event.eventType === "steam_started_playing")
      ? "started"
      : "owned";
  }
  if (
    events.some((event) =>
      ["steam_price_drop", "steam_sale_started"].includes(event.eventType),
    )
  )
    return "prices";
  return "updates";
}

export function groupNotifications(groups = []) {
  const buckets = new Map();
  for (const group of groups) {
    const category = notificationCategory(group);
    if (!buckets.has(category))
      buckets.set(category, { category, groups: [], unseen: false });
    const bucket = buckets.get(category);
    bucket.groups.push(group);
    bucket.unseen ||= Boolean(group.unseen);
  }
  const otherActivityPriority = (group) => {
    const event = primaryNotificationEvent(group);
    if (event?.eventType === "wishlist_added") return 0;
    if (["wishlist_removed", "wishlist_likely_purchased"].includes(event?.eventType))
      return 1;
    if (event?.eventType === "wishlist_priority_changed") return 2;
    return 3;
  };
  const newestFirst = (left, right) =>
    Number(right.id) - Number(left.id);
  if (buckets.has("updates")) {
    buckets.get("updates").groups.sort((left, right) =>
      otherActivityPriority(left) - otherActivityPriority(right) || newestFirst(left, right),
    );
  }
  if (buckets.has("prices")) buckets.get("prices").groups.sort(newestFirst);
  return ["owned", "started", "playing", "prices", "updates"].flatMap((key) =>
    buckets.has(key) ? [buckets.get(key)] : [],
  );
}

export function primaryNotificationEvent(group) {
  return [...(group.events || [])].sort((a, b) => {
    const priority = (event) =>
      event.source === "steam_library" && event.state === "open"
        ? event.eventType === "steam_started_playing"
          ? 2
          : 1
        : 0;
    return priority(b) - priority(a) || Number(b.id) - Number(a.id);
  })[0];
}
