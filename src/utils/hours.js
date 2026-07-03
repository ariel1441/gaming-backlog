function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

const ACTUAL_PRIMARY_STATUSES = new Set([
  "finished",
  "played alot but didnt finish",
]);

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function resolveGameHours(game = {}) {
  const steamHours = toPositiveNumber(game.steamPlaytimeHours);
  const estimateHours = toPositiveNumber(game.displayHLTB ?? game.how_long_to_beat);
  const preferredSource = String(game.hours_preferred_source || "auto");
  const locked = !!game.hours_locked;
  const steamActual = steamHours
    ? {
        hours: steamHours,
        label: `${steamHours}h`,
      source: "steam",
      sourceLabel: locked ? "Locked Steam actual" : "Steam actual",
      isActual: true,
    }
    : null;
  const estimate = estimateHours
    ? {
        hours: estimateHours,
        label: `${estimateHours}h`,
      source: "estimate",
      sourceLabel: locked ? "Locked estimate" : "Estimate",
      isActual: false,
    }
    : null;
  const useActualAsPrimary =
    preferredSource === "steam_actual" ||
    (preferredSource === "auto" && ACTUAL_PRIMARY_STATUSES.has(normalizeStatus(game.status)));

  if (estimate && preferredSource === "estimate") {
    return {
      ...estimate,
      estimateHours,
      actualHours: steamHours,
      secondarySteamHours: steamHours,
      preferredSource,
      hoursLocked: locked,
    };
  }

  if (steamActual && (useActualAsPrimary || !estimate)) {
    return {
      ...steamActual,
      estimateHours,
      actualHours: steamHours,
      secondarySteamHours: null,
      preferredSource,
      hoursLocked: locked,
    };
  }

  if (estimate) {
    return {
      ...estimate,
      estimateHours,
      actualHours: steamHours,
      secondarySteamHours: steamHours,
      preferredSource,
      hoursLocked: locked,
    };
  }

  return {
    hours: null,
    label: "TBD",
    source: "missing",
    sourceLabel: "Hours",
    isActual: false,
    estimateHours: null,
    actualHours: steamHours,
    secondarySteamHours: steamHours,
    preferredSource,
    hoursLocked: locked,
  };
}

export function hoursValueForList(game = {}) {
  return resolveGameHours(game).hours;
}
