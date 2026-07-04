import { parseGameDate } from "./gameDateInsights.js";

const EVENT_ORDER = {
  finished: 0,
  started: 1,
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatTimelineMonth(event) {
  return MONTH_FORMATTER.format(event.date);
}

export function formatTimelineDay(event) {
  return DAY_FORMATTER.format(event.date);
}

export function buildTimelineEvents(games = []) {
  const events = [];

  for (const game of Array.isArray(games) ? games : []) {
    const title = game?.name || "Untitled game";
    const started = parseGameDate(game?.started_at);
    const finished = parseGameDate(game?.finished_at);

    if (started) {
      events.push({
        id: `${game.id ?? title}-started-${started.value}`,
        type: "started",
        date: started.date,
        dateValue: started.value,
        timestamp: started.timestamp,
        year: started.year,
        game,
        title,
      });
    }

    if (finished) {
      events.push({
        id: `${game.id ?? title}-finished-${finished.value}`,
        type: "finished",
        date: finished.date,
        dateValue: finished.value,
        timestamp: finished.timestamp,
        year: finished.year,
        game,
        title,
      });
    }
  }

  return events.sort(compareTimelineEvents);
}

export function filterTimelineEvents(
  events = [],
  { eventType = "all", year = "all", datePreset = "all", search = "", now } = {}
) {
  const query = String(search || "").trim().toLowerCase();
  const activeYear = Number.isFinite(Number(year)) ? Number(year) : null;
  const dateRange = dateRangeForPreset(datePreset, now);

  return (Array.isArray(events) ? events : []).filter((event) => {
    if (eventType !== "all" && event.type !== eventType) return false;
    if (activeYear && event.year !== activeYear) return false;
    if (dateRange) {
      if (event.timestamp < dateRange.start || event.timestamp > dateRange.end) {
        return false;
      }
    }
    if (query && !String(event.title || "").toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
}

export function compareTimelineEvents(a, b) {
  if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;

  const typeDiff =
    (EVENT_ORDER[a.type] ?? 99) - (EVENT_ORDER[b.type] ?? 99);
  if (typeDiff) return typeDiff;

  return String(a.title).localeCompare(String(b.title), undefined, {
    sensitivity: "base",
  });
}

export function groupTimelineEvents(events = []) {
  const groups = [];
  const byKey = new Map();

  for (const event of events) {
    const key = `${event.year}-${String(event.date.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}`;

    if (!byKey.has(key)) {
      const group = {
        key,
        label: formatTimelineMonth(event),
        events: [],
        started: 0,
        finished: 0,
      };
      byKey.set(key, group);
      groups.push(group);
    }

    const group = byKey.get(key);
    group.events.push(event);
    if (event.type === "started") group.started += 1;
    if (event.type === "finished") group.finished += 1;
  }

  return groups;
}

export function formatTimelineGroupSummary(group) {
  const parts = [];
  if (group?.started) {
    parts.push(`${group.started} started`);
  }
  if (group?.finished) {
    parts.push(`${group.finished} finished`);
  }
  return parts.length
    ? parts.join(", ")
    : `${group?.events?.length || 0} ${group?.events?.length === 1 ? "event" : "events"}`;
}

export function summarizeTimeline(games = [], events = buildTimelineEvents(games)) {
  const started = events.filter((event) => event.type === "started").length;
  const finished = events.filter((event) => event.type === "finished").length;
  const active = (Array.isArray(games) ? games : []).filter(
    (game) => parseGameDate(game?.started_at) && !parseGameDate(game?.finished_at)
  ).length;

  return {
    total: events.length,
    started,
    finished,
    active,
  };
}

function dateRangeForPreset(preset, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date();
  const year = now.getFullYear();

  if (preset === "thisYear") {
    return {
      start: Date.UTC(year, 0, 1),
      end: Date.UTC(year, 11, 31),
    };
  }

  if (preset === "lastYear") {
    return {
      start: Date.UTC(year - 1, 0, 1),
      end: Date.UTC(year - 1, 11, 31),
    };
  }

  if (preset === "last90") {
    const today = Date.UTC(year, now.getMonth(), now.getDate());
    return {
      start: today - 89 * MS_PER_DAY,
      end: today,
    };
  }

  return null;
}
