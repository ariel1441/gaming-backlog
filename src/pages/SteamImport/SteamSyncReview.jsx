import { useState } from "react";
import { Badge, Button, GameCover, Modal, SelectMenu } from "../../components/ui";
import PersonalGenreSuggestionEditor from "../../components/PersonalGenreSuggestionEditor";
import { statusOption } from "../../utils/statusDisplay";
import {
  formatSteamDate,
  formatSteamPlaytime,
  steamCapsuleUrl,
} from "../../utils/steamDisplay";
function syncReviewKey(item) {
  return item?.activityEventId
    ? `activity:${item.activityEventId}`
    : `${item?.steamAppId || ""}:${item?.gameId || ""}:${item?.candidateId || ""}`;
}

export function removeSyncReviewItem(review, item) {
  if (!review) return null;
  const key = syncReviewKey(item);
  const next = {
    ...review,
    startedPlaying: (review.startedPlaying || []).filter(
      (entry) => syncReviewKey(entry) !== key,
    ),
    statusSuggestions: (review.statusSuggestions || []).filter(
      (entry) => syncReviewKey(entry) !== key,
    ),
    newSteamGames: (review.newSteamGames || []).filter(
      (entry) => syncReviewKey(entry) !== key,
    ),
  };
  next.total =
    next.startedPlaying.length +
    next.statusSuggestions.length +
    next.newSteamGames.length;
  return next.total ? next : null;
}

export function SteamSyncReviewModal({
  review,
  applyingGameId,
  addingCandidateId,
  statuses = [],
  availablePersonalGenres = [],
  onClose,
  onApplyStatus,
  onAddCandidate,
  onDismissItem,
  onReviewImport,
}) {
  const startedPlaying = review.startedPlaying || [];
  const statusSuggestions = review.statusSuggestions || [];
  const newSteamGames = review.newSteamGames || [];
  return (
    <Modal
      title="Steam sync review"
      description="Steam found new activity worth checking before it changes your backlog."
      onClose={onClose}
      size="3xl"
    >
      <div className="space-y-5">
        <SyncReviewSection
          title="Started playing"
          empty="No newly started games in this sync."
          items={startedPlaying}
          applyingGameId={applyingGameId}
          addingCandidateId={addingCandidateId}
          statuses={statuses}
          availablePersonalGenres={availablePersonalGenres}
          onApplyStatus={onApplyStatus}
          onAddCandidate={onAddCandidate}
          onDismissItem={onDismissItem}
          onReviewImport={onReviewImport}
        />
        <SyncReviewSection
          title="Status looks outdated"
          empty="No linked backlog statuses need attention."
          items={statusSuggestions}
          applyingGameId={applyingGameId}
          addingCandidateId={addingCandidateId}
          statuses={statuses}
          availablePersonalGenres={availablePersonalGenres}
          onApplyStatus={onApplyStatus}
          onAddCandidate={onAddCandidate}
          onDismissItem={onDismissItem}
          onReviewImport={onReviewImport}
        />
        <SyncReviewSection
          title="New Steam games"
          empty="No newly discovered unplayed Steam games in this sync."
          items={newSteamGames}
          applyingGameId={applyingGameId}
          addingCandidateId={addingCandidateId}
          statuses={statuses}
          availablePersonalGenres={availablePersonalGenres}
          onApplyStatus={onApplyStatus}
          onAddCandidate={onAddCandidate}
          onDismissItem={onDismissItem}
          onReviewImport={onReviewImport}
          importGroup="unplayed"
        />
        <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onReviewImport("newly_played")}
          >
            Open newly played pile
          </Button>
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SyncReviewSection({
  title,
  empty,
  items,
  applyingGameId,
  addingCandidateId,
  statuses,
  availablePersonalGenres,
  onApplyStatus,
  onAddCandidate,
  onDismissItem,
  onReviewImport,
  importGroup = "newly_played",
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
        <Badge variant={items.length ? "primary" : "default"}>
          {items.length}
        </Badge>
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <SyncReviewRow
              key={syncReviewKey(item)}
              item={item}
              applying={applyingGameId === item.gameId}
              adding={addingCandidateId === item.candidateId}
              statuses={statuses}
              availablePersonalGenres={availablePersonalGenres}
              onApplyStatus={onApplyStatus}
              onAddCandidate={onAddCandidate}
              onDismiss={() => onDismissItem(item)}
              onReviewImport={() => onReviewImport(importGroup)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-surface-border bg-surface-bg/35 px-3 py-3 text-sm text-content-muted">
          {empty}
        </div>
      )}
    </section>
  );
}

function SyncReviewRow({
  item,
  applying,
  adding,
  statuses = [],
  availablePersonalGenres = [],
  onApplyStatus,
  onAddCandidate,
  onDismiss,
  onReviewImport,
}) {
  const imageUrl = steamCapsuleUrl(item);
  const title = item.gameName || item.steamName;
  const observed = formatSteamDate(item.firstPlayObservedAt);
  const lastPlayed = formatSteamDate(item.lastPlayedAt);
  const canApply = Boolean(item.gameId);
  const canAdd = Boolean(item.candidateId && item.canAddToBacklog);
  const [targetStatus, setTargetStatus] = useState(item.selectedStatus || item.suggestedStatus || "");
  const [selectedPersonalGenreIds, setSelectedPersonalGenreIds] = useState(() =>
    (item.personalGenreSuggestions || []).map((genre) => Number(genre.id)),
  );
  const approximateStartedAt = item.firstPlayObservedAt || item.lastPlayedAt;
  const canSetStartedAt =
    canApply &&
    !item.startedAt &&
    approximateStartedAt &&
    Number.isFinite(new Date(approximateStartedAt).getTime());
  return (
    <article className="grid gap-3 rounded-lg border border-surface-border bg-surface-bg/35 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <GameCover
          src={imageUrl}
          name={title}
          className="h-14 w-24 shrink-0 rounded"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4
              className="truncate text-sm font-semibold text-content-primary"
              title={title}
            >
              {title}
            </h4>
            {item.currentStatus ? <Badge>{item.currentStatus}</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
            <span>{formatSteamPlaytime(item.playtimeMinutes)}</span>
            {observed ? <span>first noticed {observed}</span> : null}
            {lastPlayed ? <span>last played {lastPlayed}</span> : null}
          </div>
          {item.suggestedStatusReason ? (
            <p className="mt-1 text-xs text-content-muted">
              {item.suggestedStatusReason}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {canApply ? (
          <>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={applying}
              onClick={() => onApplyStatus(item, { setStartedAt: false })}
            >
              {applying ? "Applying..." : "Mark playing"}
            </Button>
            {canSetStartedAt ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={applying}
                onClick={() => onApplyStatus(item, { setStartedAt: true })}
              >
                Mark playing + approximate date
              </Button>
            ) : null}
          </>
        ) : canAdd ? (
          <div className="min-w-64 space-y-2.5">
            <PersonalGenreSuggestionEditor
              suggestions={item.personalGenreSuggestions || []}
              availablePersonalGenres={availablePersonalGenres}
              selectedIds={selectedPersonalGenreIds}
              onChange={setSelectedPersonalGenreIds}
              disabled={adding}
              compact
            />
            <div className="flex flex-wrap gap-2 md:justify-end">
              <SelectMenu
                id={`steam-sync-review-status-${item.candidateId}`}
                aria-label={`Backlog status for ${title}`}
                value={targetStatus}
                onChange={setTargetStatus}
                options={statuses.filter((status) => status.toLowerCase() !== "wishlist").map(statusOption)}
                placeholder="Choose status"
                className="min-w-44"
                disabled={adding}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!targetStatus || adding}
                onClick={() => onAddCandidate(item, targetStatus, selectedPersonalGenreIds)}
              >
                {adding ? "Adding..." : "Add to Backlog"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onReviewImport}
          >
            Open Steam Import Review
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </article>
  );
}
