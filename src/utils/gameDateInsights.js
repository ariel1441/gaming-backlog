const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseGameDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { date, year, timestamp: date.getTime(), value };
}

export function computeGameDateInsights(games = [], now = new Date()) {
  const currentYear = now.getFullYear();
  const yearly = new Map();
  let startedThisYear = 0;
  let finishedThisYear = 0;
  let activeCount = 0;
  let activeOldest = null;
  let completionDayTotal = 0;
  let completionDayCount = 0;

  const bumpYear = (year, key) => {
    const row = yearly.get(year) || { year, started: 0, finished: 0 };
    row[key] += 1;
    yearly.set(year, row);
  };

  for (const game of Array.isArray(games) ? games : []) {
    const started = parseGameDate(game?.started_at);
    const finished = parseGameDate(game?.finished_at);

    if (started) {
      bumpYear(started.year, "started");
      if (started.year === currentYear) startedThisYear += 1;
    }

    if (finished) {
      bumpYear(finished.year, "finished");
      if (finished.year === currentYear) finishedThisYear += 1;
    }

    if (started && !finished) {
      activeCount += 1;
      if (!activeOldest || started.timestamp < activeOldest.started.timestamp) {
        activeOldest = { game, started };
      }
    }

    if (started && finished && finished.timestamp >= started.timestamp) {
      completionDayTotal += Math.round(
        (finished.timestamp - started.timestamp) / MS_PER_DAY
      );
      completionDayCount += 1;
    }
  }

  const averageCompletionDays = completionDayCount
    ? completionDayTotal / completionDayCount
    : null;

  return {
    yearly: Array.from(yearly.values()).sort((a, b) => a.year - b.year),
    startedThisYear,
    finishedThisYear,
    activeCount,
    averageCompletionDays,
    completionSampleSize: completionDayCount,
    oldestActive: activeOldest
      ? {
          name: activeOldest.game?.name || "Untitled game",
          started_at: activeOldest.started.value,
          year: activeOldest.started.year,
        }
      : null,
  };
}
