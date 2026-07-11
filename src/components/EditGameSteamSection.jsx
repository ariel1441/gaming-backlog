import { ExternalLink, Gamepad2, Search, Trophy, Unlink } from "lucide-react";
import { Button, TextInput } from "./ui";
import {
  formatSteamDate,
  formatSteamPlaytime,
  steamCapsuleUrl,
} from "../utils/steamDisplay";

export default function EditGameSteamSection({
  currentSteam,
  currentAchievements,
  currentAchievementsSyncedAt,
  showSteamSearch,
  setShowSteamSearch,
  steamUnlinking,
  unlinkSteam,
  syncCurrentSteamAchievements,
  steamAchievementsSyncing,
  steamQuery,
  setSteamQuery,
  isSubmitting,
  searchSteamLinks,
  steamSearching,
  steamResults,
  game,
  steamAttachingId,
  attachSteam,
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-bg/35 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-content-secondary">
          Steam link
        </h3>
        <p className="mt-1 text-sm leading-6 text-content-muted">
          Attach a synced Steam app to this backlog game for ownership and
          actual playtime.
        </p>
      </div>

      {currentSteam ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-integration-border/80 bg-integration-surface/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-integration-border/80 bg-surface-card/60 text-integration-steam">
                  <Gamepad2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-content-primary">
                    {currentSteam.steamName ||
                      `Steam app ${currentSteam.steamAppId}`}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
                    {currentSteam.steamAppId ? (
                      <span>App {currentSteam.steamAppId}</span>
                    ) : null}
                    <span>
                      {formatSteamPlaytime(currentSteam.playtimeMinutes)}
                    </span>
                    {currentSteam.lastPlayedAt ? (
                      <span>
                        Last played {formatSteamDate(currentSteam.lastPlayedAt)}
                      </span>
                    ) : null}
                    {currentSteam.lastSyncedAt ? (
                      <span>
                        Synced {formatSteamDate(currentSteam.lastSyncedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentSteam.steamAppId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      window.open(
                        `https://store.steampowered.com/app/${currentSteam.steamAppId}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Store
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowSteamSearch((value) => !value)}
                  disabled={steamUnlinking}
                >
                  Change link
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={unlinkSteam}
                  disabled={steamUnlinking}
                >
                  <Unlink className="h-4 w-4" aria-hidden="true" />
                  {steamUnlinking ? "Unlinking..." : "Unlink"}
                </Button>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-surface-border bg-surface-bg/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-content-primary">
                    <Trophy
                      className="h-4 w-4 text-integration-steam"
                      aria-hidden="true"
                    />
                    <span>{currentAchievements?.label || "Not synced"}</span>
                  </div>
                  <div className="mt-1 text-xs text-content-muted">
                    {currentAchievements?.detail ||
                      "Achievements have not been synced yet."}
                    {currentAchievements?.remainingLabel
                      ? ` ${currentAchievements.remainingLabel}.`
                      : ""}
                    {currentAchievementsSyncedAt
                      ? ` Last synced ${currentAchievementsSyncedAt}.`
                      : ""}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={syncCurrentSteamAchievements}
                  disabled={steamAchievementsSyncing || steamUnlinking}
                >
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  {steamAchievementsSyncing
                    ? "Syncing..."
                    : "Sync achievements"}
                </Button>
              </div>
              {currentAchievements?.percent != null ? (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-elevated">
                  <div
                    className="h-full rounded-full bg-integration-steam"
                    style={{
                      width: `${Math.min(
                        Math.max(currentAchievements.percent, 0),
                        100,
                      )}%`,
                    }}
                  />
                </div>
              ) : null}
              <p className="mt-2 text-xs text-content-muted">
                Steam achievements are private here and update only when you
                sync.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!currentSteam || showSteamSearch ? (
        <div className={`space-y-3 ${currentSteam ? "mt-3" : ""}`}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
              <TextInput
                value={steamQuery}
                onChange={(event) => setSteamQuery(event.target.value)}
                placeholder="Search synced Steam apps..."
                disabled={isSubmitting}
                className="pl-9"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    searchSteamLinks();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={searchSteamLinks}
              disabled={isSubmitting || steamSearching}
            >
              {steamSearching ? "Searching..." : "Search Steam"}
            </Button>
          </div>

          <div className="space-y-2">
            {steamResults.map((candidate) => {
              const imageUrl = steamCapsuleUrl(candidate, {
                preferIcon: true,
              });
              const linkedElsewhere =
                candidate.linkedGameId &&
                Number(candidate.linkedGameId) !== Number(game.id);
              return (
                <div
                  key={candidate.id}
                  className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-elevated/40 p-2"
                >
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-10 w-16 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-10 w-16 items-center justify-center rounded bg-surface-card text-content-muted">
                      {String(candidate.steamName || "?").charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-content-primary">
                      {candidate.steamName}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-content-muted">
                      <span>
                        {formatSteamPlaytime(candidate.playtimeMinutes)}
                      </span>
                      {candidate.lastPlayedAt ? (
                        <span>
                          Last played {formatSteamDate(candidate.lastPlayedAt)}
                        </span>
                      ) : null}
                      {candidate.linkedGameName ? (
                        <span>
                          {linkedElsewhere
                            ? "Currently linked to"
                            : "Linked to"}{" "}
                          {candidate.linkedGameName}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={linkedElsewhere ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => attachSteam(candidate)}
                    disabled={steamAttachingId === candidate.id}
                  >
                    {steamAttachingId === candidate.id
                      ? "Linking..."
                      : linkedElsewhere
                        ? "Move link"
                        : "Link"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
