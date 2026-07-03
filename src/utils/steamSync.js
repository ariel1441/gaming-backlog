function plural(value, singular, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

export function formatSteamLibrarySyncMessage(payload) {
  const checked = Number(payload?.total || 0);
  const achievements = payload?.achievements;
  const created = Number(payload?.candidatesCreated || 0);
  const updated = Number(payload?.candidatesUpdated || 0);
  const unchanged = Number(payload?.candidatesUnchanged || 0);
  const autoMatched = Number(payload?.autoMatched || 0);
  const autoReviewed = Number(payload?.autoReviewed || 0);
  const duplicates = Number(payload?.duplicates || 0);
  const filtered = Number(payload?.filtered || 0);
  const needsReview = Number(payload?.needsReview || 0);
  const hasCandidateCounts = created || updated || unchanged;

  if (payload?.skipped) {
    if (achievements && !achievements.errorCode) {
      const synced = Number(achievements.synced || 0);
      const skipped = Number(achievements.skipped || 0);
      if (synced > 0) {
        return `Steam library was checked recently. Synced achievements for ${plural(
          synced,
          "linked game"
        )}.`;
      }
      if (skipped > 0) {
        return "Steam library and achievements were checked recently. Try again after the cooldown.";
      }
    }
    return "Steam was checked recently. Try again after the cooldown.";
  }

  if (payload?.private) {
    return "Steam returned no games. Your Steam game details may be private.";
  }

  const parts = [`Checked ${plural(checked, "Steam app")} for library changes.`];
  if (hasCandidateCounts) {
    parts.push(
      `Import queue: ${created} new, ${updated} updated, ${unchanged} unchanged.`
    );
  }
  if (autoReviewed || autoMatched || duplicates || filtered || needsReview) {
    const reviewParts = [];
    if (autoMatched) reviewParts.push(`${autoMatched} auto-matched`);
    if (duplicates) reviewParts.push(`${duplicates} likely already in backlog`);
    if (filtered) reviewParts.push(`${filtered} likely non-games`);
    if (needsReview) reviewParts.push(`${needsReview} still need review`);
    if (reviewParts.length) {
      parts.push(`Review signals: ${reviewParts.join(", ")}.`);
    }
  }

  if (achievements && !achievements.errorCode) {
    const synced = Number(achievements.synced || 0);
    const unavailable = Number(achievements.unavailable || 0);
    const failed = Number(achievements.failed || 0);
    const skipped = Number(achievements.skipped || 0);
    const achievementParts = [];

    if (synced) achievementParts.push(`${synced} synced`);
    if (skipped) achievementParts.push(`${skipped} recently checked`);
    if (unavailable || failed) achievementParts.push(`${unavailable + failed} unavailable`);

    if (achievementParts.length) {
      parts.push(`Achievements: ${achievementParts.join(", ")}.`);
    }
  }

  return parts.join(" ");
}

export function formatAchievementBatchSyncMessage(payload) {
  const synced = Number(payload?.synced || 0);
  const skipped = Number(payload?.skipped || 0);
  const none = Number(payload?.none || payload?.statusCounts?.none || 0);
  const privateCount = Number(payload?.private || payload?.statusCounts?.private || 0);
  const unavailable = Number(payload?.unavailable || 0);
  const failed = Number(payload?.failed || 0);

  if (!synced && skipped && !none && !unavailable && !failed && !privateCount) {
    return "Steam achievements were checked recently. Try again after the cooldown.";
  }

  const parts = [];
  if (synced) parts.push(`${synced} synced`);
  if (none) parts.push(`${none} with no achievements`);
  if (skipped) parts.push(`${skipped} recently checked`);
  if (privateCount || unavailable || failed) {
    parts.push(`${privateCount + unavailable + failed} unavailable`);
  }

  return parts.length
    ? `Achievements: ${parts.join(", ")}.`
    : "No linked Steam achievements needed syncing.";
}

export function formatAchievementGameSyncMessage(payload) {
  if (payload?.skipped) {
    return {
      tone: "info",
      message: "Achievements were checked recently. Try again after the cooldown.",
    };
  }
  if (payload?.failed || payload?.achievements?.status === "failed") {
    return {
      tone: "warning",
      message: "Could not sync achievements. Try again later.",
    };
  }

  const status = payload?.achievements?.status || "unknown";
  if (status === "synced") {
    return { tone: "success", message: "Steam achievements synced." };
  }
  if (status === "none") {
    return {
      tone: "info",
      message: "Steam does not list achievements for this game.",
    };
  }
  if (status === "private" || status === "unavailable") {
    return {
      tone: "warning",
      message: "Steam did not return achievement data for this game.",
    };
  }

  return { tone: "info", message: "Achievement sync finished." };
}
