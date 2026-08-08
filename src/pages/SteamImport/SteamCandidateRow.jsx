import {
  ActionMenu,
  Badge,
  Button,
  Checkbox,
  GameCover,
  SelectMenu,
} from "../../components/ui";
import { filteredReasonLabel } from "../../utils/steamImport";
import { statusOption } from "../../utils/statusDisplay";
import {
  formatSteamDate,
  formatSteamPlaytime,
  steamCapsuleUrl,
} from "../../utils/steamDisplay";

function statusVariant(status) {
  if (status === "imported" || status === "attached") return "success";
  if (status === "ignored") return "warning";
  if (status === "accepted") return "primary";
  return "default";
}

function importStatusLabel(status) {
  if (status === "accepted") return "Match approved";
  if (status === "attached") return "Linked";
  if (status === "ignored") return "Ignored";
  if (status === "imported") return "Added";
  return "Needs decision";
}

function candidateMatchHint(candidate) {
  if (!candidate.proposedCatalogName && !candidate.duplicateGameName) return "";
  if (!candidate.matchReason && !candidate.matchConfidence) return "";
  const confidence = candidate.matchConfidence
    ? `${candidate.matchConfidence} match`
    : "Match";
  return candidate.matchReason
    ? `${confidence}: ${candidate.matchReason}`
    : confidence;
}

function candidatePrimaryAction(candidate) {
  if (candidate.importStatus === "ignored") {
    return { label: "Restore", kind: "restore", variant: "secondary" };
  }
  if (candidate.duplicateGameId) {
    return { label: "Link game", kind: "import", variant: "primary" };
  }
  if (candidate.proposedCatalogGameId) {
    return { label: "Add to backlog", kind: "import", variant: "primary" };
  }
  return { label: "Choose match", kind: "match", variant: "primary" };
}

function detectedAction(candidate) {
  if (candidate.duplicateGameName) {
    return {
      eyebrow: "Existing backlog game found",
      title: candidate.duplicateGameName,
      detail: "Steam ownership will be linked to this game.",
    };
  }
  if (candidate.proposedCatalogName) {
    return {
      eyebrow: "Catalog match found",
      title: candidate.proposedCatalogName,
      detail: "This will be added as a new backlog game.",
    };
  }
  return {
    eyebrow: "Match required",
    title: "Choose the correct catalog game",
    detail: "A match is required before this Steam app can be added.",
  };
}

export function CandidateRow({
  candidate,
  selected,
  statuses = [],
  onToggleSelected,
  onIgnore,
  onAccept,
  onRestore,
  onImport,
  onSetStatus,
  onChangeMatch,
}) {
  const canImport =
    !!candidate.proposedCatalogGameId || !!candidate.duplicateGameId;
  const canSelect =
    candidate.importStatus === "pending" ||
    candidate.importStatus === "accepted" ||
    candidate.importStatus === "ignored";
  const isIgnored = candidate.importStatus === "ignored";
  const matchHint = candidateMatchHint(candidate);
  const imageUrl = steamCapsuleUrl(candidate);
  const primaryAction = candidatePrimaryAction(candidate);
  const outcome = detectedAction(candidate);
  const statusValue =
    candidate.selectedStatus || candidate.suggestedStatus || "";
  const statusOptions = (statuses || []).map(statusOption);
  const runPrimaryAction = () => {
    if (primaryAction.kind === "restore") onRestore();
    else if (primaryAction.kind === "match") onChangeMatch();
    else onImport();
  };

  return (
    <article
      className={`rounded-card border bg-surface-card transition-colors ${
        selected
          ? "border-primary/55 shadow-glow-primary"
          : "border-surface-border hover:border-surface-border-strong"
      }`}
    >
      <div className="grid gap-4 p-4 xl:grid-cols-[2rem_minmax(280px,1.05fr)_minmax(260px,0.9fr)_minmax(210px,0.65fr)_auto] xl:items-center">
        <Checkbox
          checked={!!selected}
          disabled={!canSelect}
          onChange={onToggleSelected}
          ariaLabel={`Select ${candidate.steamName}`}
          className="self-start pt-1 xl:self-center xl:pt-0 [&>span:first-of-type]:h-6 [&>span:first-of-type]:w-6 [&>span:first-of-type_svg]:h-4 [&>span:first-of-type_svg]:w-4"
        />

        <div className="flex min-w-0 items-center gap-3">
          <GameCover
            src={imageUrl}
            name={candidate.steamName}
            className="h-20 w-32 shrink-0 rounded-lg border border-surface-border"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="min-w-0 break-words text-base font-semibold text-content-primary xl:line-clamp-2"
                title={candidate.steamName}
              >
                {candidate.steamName}
              </h3>
              <Badge variant={statusVariant(candidate.importStatus)}>
                {importStatusLabel(candidate.importStatus)}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-content-muted">
              <span>{formatSteamPlaytime(candidate.playtimeMinutes)}</span>
              {candidate.lastPlayedAt ? (
                <span>
                  Last played {formatSteamDate(candidate.lastPlayedAt)}
                </span>
              ) : null}
              <span>Steam app {candidate.steamAppId}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {candidate.filteredReason ? (
                <Badge variant="warning">
                  {filteredReasonLabel(candidate.filteredReason)}
                </Badge>
              ) : null}
              {candidate.firstPlayObservedAt ? (
                <Badge variant="info">New Steam activity</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-surface-border/75 bg-surface-bg/35 px-3 py-2.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-content-muted">
            {outcome.eyebrow}
          </div>
          <div
            className="mt-1 line-clamp-2 text-sm font-semibold text-content-primary"
            title={outcome.title}
          >
            {outcome.title}
          </div>
          <div className="mt-1 text-xs text-content-secondary">
            {outcome.detail}
          </div>
          {matchHint ? (
            <div
              className="mt-1 line-clamp-2 text-xs text-content-muted"
              title={matchHint}
            >
              {matchHint}
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="mb-1.5 text-xs font-medium text-content-muted">
            Backlog status
          </div>
          <SelectMenu
            id={`steam-candidate-status-${candidate.id}`}
            value={statusValue}
            onChange={onSetStatus}
            placeholder="Choose status"
            className="h-9 w-full"
            options={statusOptions}
            disabled={isIgnored}
          />
          {candidate.suggestedStatusReason ? (
            <p
              className="mt-1.5 line-clamp-2 text-xs text-content-muted"
              title={candidate.suggestedStatusReason}
            >
              {candidate.suggestedStatusReason}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:max-w-48 xl:justify-end">
          <Button
            type="button"
            variant={primaryAction.variant}
            size="sm"
            onClick={runPrimaryAction}
            disabled={primaryAction.kind === "import" && !canImport}
          >
            {primaryAction.label}
          </Button>
          <ActionMenu
            label="More"
            ariaLabel={`More actions for ${candidate.steamName}`}
          >
            {({ close }) => (
              <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onChangeMatch();
                }}
                disabled={isIgnored}
                className="min-h-11 w-full rounded-md px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70 disabled:opacity-45"
              >
                Change match
              </button>
              {!candidate.duplicateGameId && !isIgnored ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onAccept();
                  }}
                  disabled={!candidate.proposedCatalogGameId}
                  className="min-h-11 w-full rounded-md px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70 disabled:opacity-45"
                >
                  Approve match
                </button>
              ) : null}
              {!isIgnored ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onIgnore();
                  }}
                  className="min-h-11 w-full rounded-md px-3 py-2 text-left text-sm text-content-secondary hover:bg-surface-elevated hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70"
                >
                  Ignore app
                </button>
              ) : null}
              </>
            )}
          </ActionMenu>
        </div>
      </div>
    </article>
  );
}
