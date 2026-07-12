import { defaultStatusSemantics } from "./statusSemantics.js";

export function achievementPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return null;
  return Math.round(percent);
}

export function formatAchievementSummary(summary) {
  const status = summary?.status || "unknown";
  const unlocked = Number(summary?.unlocked);
  const total = Number(summary?.total);
  const percent = achievementPercent(summary?.percent);
  const hasCounts = Number.isFinite(unlocked) && Number.isFinite(total) && total > 0;

  if (status === "synced" && hasCounts) {
    const remaining = Math.max(total - unlocked, 0);
    return {
      status,
      label: `${unlocked}/${total}`,
      detail:
        percent == null
          ? "Synced"
          : percent >= 100
            ? "100% complete"
            : `${percent}% complete${remaining ? ` - ${remaining} left` : ""}`,
      compact: percent == null ? `${unlocked}/${total}` : `${percent}%`,
      percent,
      unlocked,
      total,
      remaining,
      remainingLabel:
        percent >= 100
          ? "Completed"
          : `${remaining} achievement${remaining === 1 ? "" : "s"} left`,
      tone: percent >= 100 ? "success" : "primary",
      isMeaningful: true,
    };
  }
  if (status === "none") {
    return {
      status,
      label: "No achievements",
      detail: "Steam does not list achievements for this game.",
      compact: "No achievements",
      percent: null,
      tone: "muted",
      isMeaningful: false,
    };
  }
  if (status === "private" || status === "unavailable") {
    return {
      status,
      label: "Unavailable",
      detail: "Steam did not return achievement data for this game.",
      compact: "Unavailable",
      percent: null,
      tone: "warning",
      isMeaningful: false,
    };
  }
  if (status === "failed") {
    return {
      status,
      label: "Sync failed",
      detail: "Could not sync achievements. Try again later.",
      compact: "Sync failed",
      percent: null,
      tone: "warning",
      isMeaningful: false,
    };
  }
  return {
    status: "unknown",
    label: "Not synced",
    detail: "Achievements have not been synced yet.",
    compact: "Not synced",
    percent: null,
    tone: "muted",
    isMeaningful: false,
  };
}

export function formatAchievementSyncDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Date.now() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (elapsed >= 0 && elapsed < dayMs) return "today";
  if (elapsed >= dayMs && elapsed < dayMs * 2) return "yesterday";
  if (elapsed >= dayMs * 2 && elapsed < dayMs * 30) {
    return `${Math.floor(elapsed / dayMs)} days ago`;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function achievementStatusSuggestion({
  status,
  playtimeMinutes,
  lastPlayedAt,
  achievements,
  statusGroupOf = defaultStatusSemantics.statusGroupOf,
} = {}) {
  const currentStatus = String(status || "").trim().toLowerCase();
  const percent = achievementPercent(achievements?.percent);
  const total = Number(achievements?.total);
  const hasAchievements = achievements?.status === "synced" && Number.isFinite(total) && total > 0;
  const minutes = Number(playtimeMinutes);
  const hours = Number.isFinite(minutes) && minutes > 0 ? minutes / 60 : 0;
  const lastPlayed = lastPlayedAt ? new Date(lastPlayedAt).getTime() : 0;
  const recent =
    Number.isFinite(lastPlayed) && lastPlayed > 0 && Date.now() - lastPlayed <= 14 * 24 * 60 * 60 * 1000;

  if (hasAchievements && percent >= 100 && statusGroupOf(currentStatus) !== "done") {
    return {
      label: "Looks complete",
      targetStatus: "finished",
      confidence: "medium",
      reason: "Steam achievements are 100% complete.",
    };
  }

  if (hasAchievements && percent >= 80 && percent < 100) {
    return {
      label: "Close to 100%",
      targetStatus: currentStatus || null,
      confidence: "low",
      reason: `${percent}% of Steam achievements are unlocked.`,
    };
  }

  if (recent && hours >= 2 && statusGroupOf(currentStatus) !== "playing") {
    return {
      label: "Recently played",
      targetStatus: "playing",
      confidence: "low",
      reason: "Steam shows recent playtime.",
    };
  }

  if (hours >= 10 && statusGroupOf(currentStatus) !== "done") {
    return {
      label: "Played a lot",
      targetStatus: "played alot but didnt finish",
      confidence: "low",
      reason: "Steam playtime is substantial, but there is no finish signal.",
    };
  }

  return null;
}
