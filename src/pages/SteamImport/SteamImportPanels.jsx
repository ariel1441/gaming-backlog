import {
  ExternalLink,
  Gamepad2,
  Library,
  Layers3,
  Link as LinkIcon,
  RefreshCw,
  Search,
  ShieldAlert,
  Unlink,
} from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  SelectMenu,
  TextInput,
} from "../../components/ui";
import { filteredReasonLabel } from "../../utils/steamImport";
import { formatSteamDate } from "../../utils/steamDisplay";
import { groupLabel } from "./steamImportGroups";
export function SteamAccountPanel({
  account,
  loading,
  syncing,
  onLink,
  onSync,
  onDisconnect,
  isDev,
  devSteamId,
  setDevSteamId,
  onDevLink,
  lastSyncReview,
  onOpenLastSyncReview,
}) {
  const privateState = account?.syncStatus === "private";

  return (
    <section className="rounded-lg border border-surface-border bg-surface-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {account?.avatarUrl ? (
            <img
              src={account.avatarUrl}
              alt=""
              className="h-11 w-11 rounded-lg border border-surface-border object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-surface-border bg-surface-bg/50 text-content-muted">
              <Gamepad2 className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-content-primary">
              {loading
                ? "Loading Steam..."
                : account
                  ? account.displayName || "Steam account linked"
                  : "Steam account"}
            </h2>
            <p className="mt-1 text-sm text-content-muted">
              {account
                ? `SteamID ${account.steamId}`
                : "Connect Steam to sync your owned games into a private review queue."}
            </p>
            {account?.profileUrl ? (
              <a
                href={account.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary-light hover:text-primary"
              >
                View Steam profile
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {account ? (
            <>
              <Button
                type="button"
                variant="primary"
                onClick={onSync}
                disabled={syncing}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {syncing ? "Syncing..." : "Sync library"}
              </Button>
              {lastSyncReview?.total ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onOpenLastSyncReview}
                >
                  Review last sync
                  <span className="ml-1 text-xs opacity-75">
                    {lastSyncReview.total}
                  </span>
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={onDisconnect}>
                <Unlink className="h-4 w-4" aria-hidden="true" />
                Disconnect
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" onClick={onLink}>
              <LinkIcon className="h-4 w-4" aria-hidden="true" />
              Link Steam
            </Button>
          )}
        </div>
      </div>

      {privateState ? (
        <div className="mt-4 flex gap-3 rounded-lg border border-state-warning/40 bg-state-warning/10 px-3 py-3 text-sm text-state-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            Steam linked successfully, but Steam returned no owned games. Set
            Steam profile game details to public, then sync again.
          </div>
        </div>
      ) : account?.lastErrorMessage ? (
        <div className="mt-4 rounded-lg border border-state-error/40 bg-state-error/10 px-3 py-3 text-sm text-state-error">
          {account.lastErrorMessage}
        </div>
      ) : null}

      {isDev && !account ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-surface-border pt-4">
          <Field
            id="steam-dev-id"
            label="Local dev SteamID64"
            className="min-w-72"
          >
            <TextInput
              id="steam-dev-id"
              value={devSteamId}
              onChange={(event) => setDevSteamId(event.target.value)}
              placeholder="7656119..."
            />
          </Field>
          <Button type="button" variant="secondary" onClick={onDevLink}>
            Dev link
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function DuplicateCleanupPanel({
  groups = [],
  loading,
  mergingKey,
  onRefresh,
  onMerge,
}) {
  if (!loading && !groups.length) {
    return null;
  }

  return (
    <section className="rounded-lg border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-content-primary">
            Duplicate cleanup
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            Merge likely duplicate backlog rows while keeping the best row and
            moving Steam links to it.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
          {loading ? "Scanning..." : "Scan again"}
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 rounded-lg border border-surface-border bg-surface-bg/35 px-3 py-6 text-center text-sm text-content-muted">
          Scanning duplicate backlog rows...
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {groups.map((groupData) => {
            const keep = groupData.games.find(
              (game) => game.id === groupData.suggestedKeepId,
            );
            return (
              <div
                key={groupData.key}
                className="rounded-lg border border-surface-border bg-surface-bg/35 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-content-primary">
                      {groupData.reason === "catalog"
                        ? "Same catalog game"
                        : "Same normalized title"}
                    </div>
                    <div className="mt-1 text-xs text-content-muted">
                      Suggested keep: {keep?.name || "best row"} -{" "}
                      {groupData.games.length} rows
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => onMerge(groupData)}
                    disabled={mergingKey === groupData.key}
                  >
                    {mergingKey === groupData.key
                      ? "Merging..."
                      : "Merge group"}
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {groupData.games.map((game) => (
                    <div
                      key={game.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        game.id === groupData.suggestedKeepId
                          ? "border-primary/40 bg-primary/10"
                          : "border-surface-border bg-surface-card/45"
                      }`}
                    >
                      <div className="truncate font-medium text-content-primary">
                        {game.name}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
                        <span>#{game.id}</span>
                        <span>{game.status}</span>
                        {game.steamSourceCount ? (
                          <span>
                            {game.steamSourceCount} Steam link
                            {game.steamSourceCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {game.hasThoughts ? <span>notes</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ReviewCategoryNav({
  activeCategory,
  categories = [],
  onChange,
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {categories.map((category) => {
        const Icon = category.icon;
        const active = category.value === activeCategory;
        return (
          <button
            key={category.value}
            type="button"
            onClick={() => onChange(category.value)}
            className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg ${
              active
                ? "border-primary bg-primary/10 text-content-primary shadow-glow-primary"
                : "border-surface-border bg-surface-bg/30 text-content-secondary hover:border-surface-border-strong hover:bg-surface-elevated/60 hover:text-content-primary"
            }`}
          >
            {Icon ? (
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary/15 text-primary-light" : "bg-surface-elevated text-content-muted"}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate text-sm font-semibold ${active ? "text-primary-light" : ""}`}
              >
                {category.label}
              </span>
              <span className="mt-0.5 block truncate text-xs text-content-muted">
                {category.description}
              </span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-primary/20 text-primary-light" : "bg-surface-elevated text-content-secondary"}`}
            >
              {category.count || 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}


export function ReviewGroupFilters({
  activeCategory,
  group,
  summary,
  readyGroups = [],
  onChange,
}) {
  const groups =
    activeCategory === "ready"
      ? readyGroups
      : activeCategory === "attention"
        ? [
            { value: "needs_match", label: "Needs match" },
            { value: "filtered", label: "Likely non-games" },
          ]
        : [];

  if (!groups.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2 border-b border-surface-border pb-4">
      {groups.map((item) => (
        <Button
          key={item.value}
          type="button"
          variant={group === item.value ? "primary" : "secondary"}
          size="sm"
          onClick={() => onChange(item.value)}
        >
          {item.label}
          <span className="ml-1 text-xs opacity-75">
            {summary?.groups?.[item.value] || 0}
          </span>
        </Button>
      ))}
    </div>
  );
}

export function SelectionActionBar({
  selectedCount,
  allVisibleSelected,
  visibleSelectableCount,
  onToggleAllVisible,
  bulkStatus,
  setBulkStatus,
  statuses = [],
  onBulkSetStatus,
  onBulkAccept,
  onBulkRestore,
  onBulkIgnore,
  onBulkImport,
  isIgnoredView,
}) {
  const statusOptions = statuses.map((status) => ({
    value: status,
    label: status,
  }));

  if (!selectedCount) return null;

  return (
    <div className="sticky top-3 z-20 mt-4 rounded-lg border border-primary/45 bg-surface-card/95 px-3 py-3 shadow-elevated backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="text-sm font-semibold text-content-primary">
            {selectedCount} selected
          </div>
          <button
            type="button"
            onClick={onToggleAllVisible}
            disabled={!visibleSelectableCount}
            className="text-xs text-content-muted hover:text-content-primary disabled:opacity-50"
          >
            {allVisibleSelected
              ? "Clear visible selection"
              : "Select all visible"}
          </button>
        </div>
        <SelectMenu
          id="steam-bulk-status"
          value={bulkStatus}
          onChange={setBulkStatus}
          placeholder="Set status"
          className="h-9 min-w-48"
          options={statusOptions}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onBulkSetStatus}
          disabled={!bulkStatus}
        >
          Apply status
        </Button>
        {!isIgnoredView ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onBulkAccept}
          >
            Approve matches
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onBulkRestore}
          >
            Restore
          </Button>
        )}
        {!isIgnoredView ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBulkIgnore}
          >
            Ignore
          </Button>
        ) : null}
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onBulkImport}
        >
          Apply selected
        </Button>
      </div>
    </div>
  );
}

export function AdvancedTools({
  group,
  currentGroupCount,
  canApprovePile,
  canHidePile,
  canImportPile,
  bulkStatus,
  setBulkStatus,
  statuses = [],
  onApplyStatusToGroup,
  onAcceptGroup,
  onIgnoreGroup,
  onImportGroup,
  onAutoMatch,
  autoMatching,
  onScanDuplicates,
  duplicateLoading,
}) {
  const statusOptions = statuses.map((status) => ({
    value: status,
    label: status,
  }));
  const hasCategoryActions = group !== "all" && currentGroupCount > 0;

  return (
    <details className="mt-4 rounded-lg border border-surface-border bg-surface-bg/20 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-content-primary">
        Advanced actions
        <span className="ml-2 text-xs font-normal text-content-muted">
          whole-category actions, matching, and duplicate repair
        </span>
      </summary>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
          <h3 className="text-sm font-semibold text-content-primary">
            Current category
          </h3>
          <p className="mt-1 text-xs text-content-muted">
            {hasCategoryActions
              ? `Apply an action to all ${currentGroupCount} apps in ${groupLabel(group)}, including apps not loaded on this page.`
              : "Choose a specific review category before using whole-category actions."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SelectMenu
              id="steam-category-status"
              value={bulkStatus}
              onChange={setBulkStatus}
              placeholder="Set status"
              className="h-9 min-w-48"
              options={statusOptions}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onApplyStatusToGroup}
              disabled={!hasCategoryActions || !bulkStatus}
            >
              Apply status
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onAcceptGroup}
              disabled={!canApprovePile}
            >
              Approve all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onIgnoreGroup}
              disabled={!canHidePile}
            >
              Ignore all
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onImportGroup}
              disabled={!canImportPile}
            >
              {group === "duplicates" ? "Link all" : "Add all"}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
          <h3 className="text-sm font-semibold text-content-primary">
            Matching and cleanup
          </h3>
          <p className="mt-1 text-xs text-content-muted">
            Use these only when matches look wrong or duplicate backlog rows
            appear.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onAutoMatch}
              disabled={autoMatching}
            >
              <Layers3 className="h-4 w-4" aria-hidden="true" />
              {autoMatching ? "Matching..." : "Improve matches"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onScanDuplicates}
              disabled={duplicateLoading}
            >
              {duplicateLoading ? "Scanning..." : "Scan duplicates"}
            </Button>
          </div>
        </section>
      </div>
    </details>
  );
}
