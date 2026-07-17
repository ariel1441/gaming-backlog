import {
  ExternalLink,
  Eye,
  Gamepad2,
  Link as LinkIcon,
  RefreshCw,
  Trophy,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  GameCover,
  IconButton,
  Modal,
  SelectMenu,
  TextInput,
} from "../../components/ui";
import {
  achievementStatusSuggestion,
  formatAchievementSummary,
  formatAchievementSyncDate,
} from "../../utils/steamAchievements";
import { filteredReasonLabel } from "../../utils/steamImport";
import {
  formatSteamDate,
  formatSteamPlaytime,
  steamCapsuleUrl,
} from "../../utils/steamDisplay";

function libraryState(app) {
  if (app.importStatus === "ignored") {
    return { label: "Hidden until restored", variant: "warning" };
  }
  if (app.importStatus === "attached" || app.importStatus === "imported") {
    return { label: "In backlog", variant: "success" };
  }
  if (app.duplicateGameName) {
    return { label: "Can link", variant: "primary" };
  }
  if (app.filteredReason) {
    return {
      label: filteredReasonLabel(app.filteredReason),
      variant: "warning",
    };
  }
  if (app.proposedCatalogGameId) {
    return { label: "Ready to add", variant: "primary" };
  }
  return { label: "Needs match", variant: "default" };
}

function libraryStateSummary(app) {
  if (app.importStatus === "ignored") {
    return {
      title: "Hidden until restored",
      description:
        "This app stays out of normal review and sync updates until you restore it.",
    };
  }
  if (app.importStatus === "attached" || app.importStatus === "imported") {
    return {
      title: app.duplicateGameName
        ? `Linked to ${app.duplicateGameName}`
        : "Linked to backlog",
      description:
        "Steam ownership, playtime, last played, and achievements can update this backlog row.",
    };
  }
  if (app.duplicateGameName) {
    return {
      title: "Already in backlog",
      description:
        "Link this Steam app to the existing backlog game instead of creating a duplicate.",
    };
  }
  if (app.filteredReason) {
    return {
      title: filteredReasonLabel(app.filteredReason),
      description:
        "This looks like DLC, a demo, a tool, media, or another app that may not belong in the backlog.",
    };
  }
  if (app.proposedCatalogGameId) {
    return {
      title: "Ready to add",
      description:
        "A catalog match is selected, so this app can become a new backlog game.",
    };
  }
  return {
    title: "Needs catalog match",
    description:
      "Choose the catalog game before adding this Steam app to the backlog.",
  };
}

export function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card px-4 py-3">
      <div className="text-xs text-content-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-content-primary">
        {value}
      </div>
    </div>
  );
}

export function SteamLibraryRow({
  app,
  navigate,
  onSyncAchievements,
  syncingAchievementGameId,
  onDetails,
  onRestore,
}) {
  const state = libraryState(app);
  const imageUrl = steamCapsuleUrl(app);
  const achievements = formatAchievementSummary(app.achievements);
  const achievementSyncedAt = formatAchievementSyncDate(
    app.achievements?.lastSyncedAt,
  );
  const linkedGameId = app.linkedGameId;
  const canSyncAchievements =
    !!linkedGameId &&
    (app.importStatus === "attached" || app.importStatus === "imported");
  const syncingAchievements =
    linkedGameId && syncingAchievementGameId === linkedGameId;
  const storeUrl = `https://store.steampowered.com/app/${app.steamAppId}`;
  const hasReviewAction =
    app.importStatus !== "attached" && app.importStatus !== "imported";
  const achievementPercentLabel =
    achievements.percent == null ? "" : `${achievements.percent}%`;
  const achievementSubtext =
    achievements.status === "synced"
      ? achievementSyncedAt
        ? `Synced ${achievementSyncedAt}`
        : ""
      : achievements.status === "unknown"
        ? ""
        : achievements.detail;
  const connectionDetail = app.firstPlayObservedAt
    ? "New Steam activity"
    : app.duplicateGameName
      ? app.duplicateGameName
      : app.filteredReason
        ? "Filtered from normal import"
        : "";

  return (
    <article className="grid min-w-[900px] grid-cols-[minmax(220px,2fr)_72px_106px_minmax(120px,0.9fr)_minmax(145px,1fr)_150px] items-center gap-2 px-3 py-2.5 transition-colors hover:bg-surface-elevated/35">
      <div className="flex min-w-0 items-center gap-3">
        <GameCover
          src={imageUrl}
          name={app.steamName}
          className="h-11 w-[74px] shrink-0 rounded"
        />
        <div className="min-w-0">
          <h2
            className="line-clamp-2 text-sm font-semibold leading-4 text-content-primary"
            title={app.steamName || ""}
          >
            {app.steamName}
          </h2>
          <div
            className="mt-0.5 truncate text-xs text-content-muted"
            title={`App ${app.steamAppId}${app.proposedCatalogName ? ` · ${app.proposedCatalogName}` : ""}`}
          >
            App {app.steamAppId}
            {app.proposedCatalogName ? ` · ${app.proposedCatalogName}` : ""}
          </div>
        </div>
      </div>

      <div className="whitespace-nowrap text-sm font-medium text-content-primary">
        {formatSteamPlaytime(app.playtimeMinutes, { empty: "0h", suffix: "" })}
      </div>

      <div className="whitespace-nowrap text-sm text-content-secondary">
        {formatSteamDate(app.lastPlayedAt) || "Never"}
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge
            variant={
              achievements.tone === "success"
                ? "success"
                : achievements.tone === "warning"
                  ? "warning"
                  : "default"
            }
          >
            {achievements.label}
          </Badge>
          {achievementPercentLabel ? (
            <span className="whitespace-nowrap text-sm font-medium text-content-primary">
              {achievementPercentLabel}
            </span>
          ) : null}
          {canSyncAchievements ? (
            <IconButton
              icon={Trophy}
              size="sm"
              variant="ghost"
              label={
                syncingAchievements
                  ? "Syncing achievements"
                  : "Sync achievements"
              }
              title={
                syncingAchievements
                  ? "Syncing achievements"
                  : "Sync achievements"
              }
              onClick={() => onSyncAchievements(app)}
              disabled={syncingAchievements}
              className={syncingAchievements ? "animate-pulse" : ""}
            />
          ) : null}
        </div>
        {achievementSubtext ? (
          <div
            className="mt-0.5 line-clamp-2 text-xs leading-4 text-content-muted"
            title={achievementSubtext}
          >
            {achievementSubtext}
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        <Badge variant={state.variant}>{state.label}</Badge>
        {connectionDetail ? (
          <div
            className={`mt-0.5 line-clamp-2 text-xs leading-4 ${app.firstPlayObservedAt ? "text-integration-steam" : "text-content-muted"}`}
            title={connectionDetail}
          >
            {connectionDetail}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-1">
        {app.importStatus === "ignored" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onRestore}
          >
            Restore
          </Button>
        ) : hasReviewAction ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              navigate(
                `/steam/import?status=active&group=${app.firstPlayObservedAt ? "newly_played" : "all"}&q=${encodeURIComponent(app.steamName || "")}`,
              )
            }
          >
            Review import
          </Button>
        ) : null}
        <IconButton
          icon={Eye}
          size="sm"
          variant="ghost"
          label="View Steam details"
          title="View details"
          onClick={onDetails}
        />
        <IconButton
          icon={ExternalLink}
          size="sm"
          variant="ghost"
          label="Open Steam store"
          title="Open Steam store"
          onClick={() => window.open(storeUrl, "_blank", "noopener,noreferrer")}
        />
      </div>
    </article>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-bg/35 px-3 py-2">
      <div className="text-xs text-content-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-content-primary">
        {value || "None"}
      </div>
    </div>
  );
}

export function SteamLibraryDrawer({
  app,
  onClose,
  onSyncAchievements,
  syncingAchievementGameId,
  onHide,
  onRestore,
  onChangeMatch,
  onLinkExisting,
  onReview,
}) {
  const state = libraryState(app);
  const stateSummary = libraryStateSummary(app);
  const imageUrl = steamCapsuleUrl(app);
  const achievements = formatAchievementSummary(app.achievements);
  const suggestion = achievementStatusSuggestion({
    status: app.selectedStatus || app.suggestedStatus,
    playtimeMinutes: app.playtimeMinutes,
    lastPlayedAt: app.lastPlayedAt,
    achievements: app.achievements,
  });
  const linkedGameId = app.linkedGameId;
  const syncingAchievements =
    linkedGameId && syncingAchievementGameId === linkedGameId;
  const canSyncAchievements =
    !!linkedGameId &&
    (app.importStatus === "attached" || app.importStatus === "imported");
  const storeUrl = `https://store.steampowered.com/app/${app.steamAppId}`;
  const isLinked =
    app.importStatus === "attached" || app.importStatus === "imported";
  const isHidden = app.importStatus === "ignored";
  const canReview = !isLinked && !isHidden;

  return (
    <Modal
      title={app.steamName || "Steam app"}
      description="Steam library details, import state, match repair, and sync actions."
      onClose={onClose}
      size="2xl"
    >
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <GameCover
            src={imageUrl}
            name={app.steamName}
            variant="steam"
            className="w-full rounded-lg"
          />
          <div className="flex flex-wrap gap-2">
            <Badge variant={state.variant}>{state.label}</Badge>
            {suggestion ? (
              <Badge variant="primary">{suggestion.label}</Badge>
            ) : null}
          </div>
          {isHidden ? (
            <div className="rounded-lg border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-sm text-state-warning">
              Hidden apps stay hidden on every Steam sync until you restore
              them.
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-content-primary">
                  {stateSummary.title}
                </h3>
                <p className="mt-1 text-sm text-content-muted">
                  {stateSummary.description}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  window.open(storeUrl, "_blank", "noopener,noreferrer")
                }
                className="shrink-0"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Store
              </Button>
            </div>
          </section>

          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <DetailItem label="Steam app" value={app.steamAppId} />
            <DetailItem
              label="Playtime"
              value={formatSteamPlaytime(app.playtimeMinutes, {
                empty: "0h",
                suffix: "",
              })}
            />
            <DetailItem
              label="Last played"
              value={formatSteamDate(app.lastPlayedAt) || "Never"}
            />
            <DetailItem
              label="First noticed played"
              value={formatSteamDate(app.firstPlayObservedAt) || "Not observed"}
            />
            <DetailItem
              label="Achievements"
              value={achievements.detail || achievements.label}
            />
          </section>

          <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
            <h3 className="text-sm font-semibold text-content-primary">
              Match and backlog
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <DetailItem
                label="Catalog match"
                value={app.proposedCatalogName || "No catalog match selected"}
              />
              <DetailItem
                label="Backlog link"
                value={
                  app.duplicateGameName ||
                  (linkedGameId ? `Game #${linkedGameId}` : "Not linked")
                }
              />
            </div>
            <div className="mt-3 grid gap-2 text-sm text-content-muted">
              {app.matchReason ? (
                <div>
                  Match reason:{" "}
                  <span className="text-content-primary">
                    {app.matchConfidence ? `${app.matchConfidence}: ` : ""}
                    {app.matchReason}
                  </span>
                </div>
              ) : null}
              {app.suggestedStatusReason ? (
                <div>
                  Status suggestion:{" "}
                  <span className="text-content-primary">
                    {app.suggestedStatusReason}
                  </span>
                </div>
              ) : null}
              {suggestion?.reason ? (
                <div>
                  Completion signal:{" "}
                  <span className="text-content-primary">
                    {suggestion.reason}
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
            <h3 className="text-sm font-semibold text-content-primary">
              Achievement summary
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-content-muted">
              <Badge
                variant={
                  achievements.tone === "success"
                    ? "success"
                    : achievements.tone === "warning"
                      ? "warning"
                      : "default"
                }
              >
                {achievements.label}
              </Badge>
              <span>{achievements.detail}</span>
              {app.achievements?.lastSyncedAt ? (
                <span>
                  Synced{" "}
                  {formatAchievementSyncDate(app.achievements.lastSyncedAt)}
                </span>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-content-primary">
                  Recommended next step
                </h3>
                <p className="mt-1 text-xs text-content-muted">
                  {isLinked
                    ? "This Steam app is already connected to your backlog."
                    : isHidden
                      ? "Restore this app before it can return to Import Review."
                      : "Continue in Steam Import Review to make the backlog decision."}
                </p>
              </div>
              <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                {canSyncAchievements ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onSyncAchievements}
                    disabled={syncingAchievements}
                  >
                    <Trophy className="h-4 w-4" aria-hidden="true" />
                    {syncingAchievements ? "Syncing..." : "Sync achievements"}
                  </Button>
                ) : null}
                {isHidden ? (
                  <Button type="button" variant="primary" onClick={onRestore}>
                    Restore
                  </Button>
                ) : null}
                {canReview ? (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={onReview}
                  >
                    Continue in Import Review
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          {!isLinked ? (
            <details className="rounded-lg border border-surface-border bg-surface-bg/20">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70">
                <span>Connection repair</span>
                <span className="text-xs font-normal text-content-muted">
                  match, link, or hide
                </span>
              </summary>
              <div className="flex flex-wrap gap-2 border-t border-surface-border p-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onChangeMatch}
                  disabled={isHidden}
                >
                  {app.proposedCatalogGameId ? "Change match" : "Choose match"}
                </Button>
                {!isHidden ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onLinkExisting}
                  >
                    Link existing backlog game
                  </Button>
                ) : null}
                {!isHidden ? (
                  <Button type="button" variant="ghost" onClick={onHide}>
                    Hide from review
                  </Button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
