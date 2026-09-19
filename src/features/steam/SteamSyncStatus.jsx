import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, RefreshCw } from "lucide-react";
import { ActionMenu, Button, Switch, useToast } from "../../components/ui";
import {
  updateSteamAccountSettings,
  cancelSteamLibrarySync,
} from "../../services/steamService";
import { useSteamExperience } from "./SteamExperienceContext";
import { relativeSavedTime } from "../../utils/steamPrice";
import { formatSteamPhaseRunDetail } from "../../utils/steamSync";

const domains = {
  library: "Library & activity",
  wishlist: "Wishlist membership",
  wishlist_prices: "Israel prices",
};
const date = (value) => (value ? new Date(value).toLocaleString() : "Not yet");

function dailyRunDetail(run) {
  const phases = run?.summary?.phases || {};
  return [
    ["library", "Library"],
    ["wishlist", "Wishlist"],
    ["wishlist_prices", "Prices"],
  ]
    .map(([key, label]) => {
      const phase = phases[key] || {};
      const status = phase.failed ? "failed" : phase.partial ? "partial" : phase.skipped ? "skipped" : "succeeded";
      return `${label} ${status}`;
    })
    .join(" · ");
}

function dailyRunTone(status) {
  if (["failed", "abandoned"].includes(status)) return "text-state-error";
  if (["partial", "skipped"].includes(status)) return "text-state-warning";
  return "text-state-success";
}

function dailyRunFacts(run) {
  const details = run?.summary?.details || {};
  const facts = [];
  const library = details.library?.diagnostics;
  const wishlist = details.wishlist?.diagnostics;
  const prices = details.wishlist_prices?.diagnostics;
  if (library?.itemsSeen) facts.push(`Library ${library.itemsSeen} seen`);
  if (wishlist?.added || wishlist?.removed || wishlist?.priorityChanged)
    facts.push(`Wishlist ${wishlist.added || 0} added · ${wishlist.removed || 0} removed · ${wishlist.priorityChanged || 0} reordered`);
  if (prices && (prices.succeeded || prices.changed || prices.deferred || prices.failed))
    facts.push(`Prices ${prices.succeeded || 0} checked · ${prices.changed || 0} changed · ${prices.deferred || 0} deferred${prices.failed ? ` · ${prices.failed} retrying` : ""}`);
  return facts;
}

export default function SteamSyncStatus({
  savedAccount,
  priceHealth,
  onMembershipRefresh,
  onPriceRefresh,
  busy = false,
  confirmEmpty,
  hasMissingMetadata = false,
  metadata,
  onMetadataRefresh,
  onMetadataBulkRefresh,
  diagnostics = false,
  onLibraryRefresh,
  compact = false,
}) {
  const health = useSteamExperience();
  const account = health.account || savedAccount;
  const job = health.activeJob;
  const [expanded, setExpanded] = useState(diagnostics);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const working = busy || !!job;
  const verification = Number(priceHealth?.verification || 0);
  const retrying = Number(
    priceHealth?.retrying ??
      Math.max(
        0,
        (priceHealth?.failed || 0) -
          verification -
          (priceHealth?.unsupported || 0),
      ),
  );
  const awaitingScheduled = Number(priceHealth?.awaiting_scheduled || 0);
  const metadataAttention = Number(metadata?.review || 0) + Number(metadata?.unmatched || 0);
  const saveAuto = async (enabled) => {
    setSaving(true);
    try {
      await updateSteamAccountSettings({ autoSyncEnabled: enabled });
      await health.reload();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };
  if (!account)
    if (compact)
      return (
        <Button as={Link} to="/settings?section=integrations" size="sm" variant="secondary">
          Connect Steam
        </Button>
      );
    else
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-content-muted">
        <span>Saved Wishlist</span>
        <Button as={Link} to="/settings" variant="ghost" size="sm">
          Connect Steam
        </Button>
        {health.error ? <span>Sync status unavailable</span> : null}
      </div>
    );
  if (compact)
    return (
      <ActionMenu
        label={working ? "Updating" : "Manage"}
        ariaLabel="Manage Steam Wishlist updates"
        icon={RefreshCw}
        align="start"
        className="whitespace-nowrap"
        menuClassName="w-[min(20rem,calc(100vw-1rem))]"
      >
        {({ close }) => (
          <div className="space-y-3 p-1">
            <div className="space-y-1 px-2 pt-1 text-xs text-content-muted">
              <p className="font-medium text-content-primary">
                {working ? "Steam is updating in the background" : `Wishlist ${relativeSavedTime(account.lastWishlistSyncAt)}`}
              </p>
              {verification + retrying > 0 ? (
                <p className="text-state-warning">
                  {verification + retrying} {verification + retrying === 1 ? "price needs" : "prices need"} attention
                </p>
              ) : null}
              {account.wishlistSyncStatus === "empty_unconfirmed" ? (
                <p className="text-state-warning">Wishlist membership needs attention</p>
              ) : null}
              {health.error ? <p className="text-state-warning">Sync status is unavailable</p> : null}
            </div>
            <div className="space-y-1 border-t border-surface-border/65 pt-2">
              {onMembershipRefresh ? (
                <Button role="menuitem" size="sm" variant="ghost" className="w-full justify-start" disabled={working} onClick={() => { close(); onMembershipRefresh(); }}>
                  Refresh membership
                </Button>
              ) : null}
              {onPriceRefresh ? (
                <Button role="menuitem" size="sm" variant="ghost" className="w-full justify-start" disabled={working} onClick={() => { close(); onPriceRefresh(); }}>
                  Refresh prices
                </Button>
              ) : null}
              {onMetadataRefresh ? (
                <Button role="menuitem" size="sm" variant="ghost" className="w-full justify-start" disabled={working} onClick={() => { close(); onMetadataRefresh(); }}>
                  Refresh metadata
                </Button>
              ) : null}
              {onMetadataBulkRefresh ? (
                <Button role="menuitem" size="sm" variant="ghost" className="w-full justify-start" disabled={working} onClick={() => { close(); onMetadataBulkRefresh(); }}>
                  Refresh all queued
                </Button>
              ) : null}
              {account.wishlistSyncStatus === "empty_unconfirmed" && confirmEmpty ? (
                <Button role="menuitem" size="sm" variant="ghost" className="w-full justify-start text-state-warning" disabled={working} onClick={() => { close(); confirmEmpty(); }}>
                  Confirm empty wishlist
                </Button>
              ) : null}
              <Button as={Link} to="/settings?section=integrations" role="menuitem" size="sm" variant="ghost" className="w-full justify-start" onClick={close}>
                Steam sync settings
              </Button>
            </div>
          </div>
        )}
      </ActionMenu>
    );
  if (!diagnostics)
    return (
      <section
        className="mb-4 text-xs text-content-muted"
        aria-label="Steam sync status"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2" role="status">
            <span>
              {working
                ? "Steam updating in background"
                : `Wishlist · ${relativeSavedTime(account.lastWishlistSyncAt)}`}
            </span>
            {verification + retrying > 0 ? (
              <span>· {verification + retrying} prices need attention</span>
            ) : awaitingScheduled > 0 ? (
              <span>· {awaitingScheduled} prices awaiting scheduled check</span>
            ) : null}
            {account.wishlistSyncStatus === "empty_unconfirmed" ? (
              <span>· Wishlist membership needs attention</span>
            ) : null}
            {health.error ? <span>· Sync status unavailable</span> : null}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            Details{" "}
            <ChevronDown
              className={`h-3.5 w-3.5 ${expanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </div>
        {expanded ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {onMembershipRefresh ? (
              <Button
                size="sm"
                disabled={working}
                onClick={onMembershipRefresh}
              >
                Refresh membership
              </Button>
            ) : null}
            {onPriceRefresh ? (
              <Button size="sm" disabled={working} onClick={onPriceRefresh}>
                Refresh prices
              </Button>
            ) : null}
            {onMetadataRefresh ? (
              <Button size="sm" disabled={working} onClick={onMetadataRefresh}>
                Refresh metadata
              </Button>
            ) : null}
            {onMetadataBulkRefresh ? (
              <Button size="sm" variant="secondary" disabled={working} onClick={onMetadataBulkRefresh}>
                Refresh all queued
              </Button>
            ) : null}
            {account.wishlistSyncStatus === "empty_unconfirmed" &&
            confirmEmpty ? (
              <Button size="sm" disabled={working} onClick={confirmEmpty}>
                Confirm genuinely empty wishlist
              </Button>
            ) : null}
            <Button
              as={Link}
              to="/settings?section=integrations"
              size="sm"
              variant="ghost"
            >
              Steam sync settings
            </Button>
          </div>
        ) : null}
      </section>
    );
  return (
    <section
      className="mb-4 rounded-xl border border-surface-border/65 bg-surface-card/40"
      aria-label="Steam sync status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted"
          role="status"
        >
          {working ? (
            <span className="inline-flex items-center gap-1.5 text-content-primary">
              <RefreshCw
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              {job
                ? `${domains[job.syncKind] || "Steam"} ${job.status === "queued" ? "queued" : "updating"}`
                : "Starting update"}
            </span>
          ) : (
            <span>
              {account.autoSyncEnabled
                ? "Scheduled updates enabled"
                : "Scheduled updates off"}
            </span>
          )}
          <span>{relativeSavedTime(account.lastWishlistSyncAt)}</span>
          {verification > 0 ? (
            <span>{verification} offers need verification</span>
          ) : null}
          {retrying > 0 ? (
            <span>{retrying} temporary refresh issues</span>
          ) : null}
          {awaitingScheduled > 0 ? (
            <span>{awaitingScheduled} awaiting scheduled check</span>
          ) : null}
          {account.wishlistSyncStatus === "empty_unconfirmed" ? (
            <span className="text-state-warning">
              Membership needs attention
            </span>
          ) : null}
          {metadataAttention > 0 ? (
            <span>{metadataAttention} metadata identities need attention</span>
          ) : metadata?.pending > 0 ? (
            <span>{metadata.pending} metadata items queued</span>
          ) : null}
          {health.error ? (
            <span>Sync status unavailable; saved data retained</span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="steam-sync-details"
        >
          Sync details
          <ChevronDown
            className={`h-3.5 w-3.5 ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </Button>
      </div>
      {expanded ? (
        <div
          id="steam-sync-details"
          className="space-y-4 border-t border-surface-border/65 p-4 text-sm"
        >
          <Switch
            checked={!!account.autoSyncEnabled}
            onChange={saveAuto}
            disabled={saving}
            label="Daily Steam sync"
            description="Update ownership, playtime, eligible achievement summaries, Wishlist membership and Israel prices in the background. Your Backlog choices stay yours."
          />
          <p className="text-xs text-content-muted">
            {account.autoSyncEnabled
              ? health.lastScheduledAt
                ? `Last scheduled run observed: ${date(health.lastScheduledAt)}. This does not guarantee the next run time.`
                : "Enabled for scheduled updates. No scheduled run has been observed for this connection yet."
              : "Automatic updates are off. Saved data stays available."}
          </p>
          <section aria-label="Daily Steam runner history" className="rounded-lg border border-surface-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">Daily runner history</p>
              <p className="text-xs text-content-muted">Latest 10 daily runner invocations</p>
            </div>
            {health.dailyRuns?.length ? (
              <ul className="mt-2 divide-y divide-surface-border/65 text-xs">
                {health.dailyRuns.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-content-primary">{date(run.startedAt)}</p>
                      <p className="mt-0.5 text-content-muted">{dailyRunDetail(run)}</p>
                      {dailyRunFacts(run).map((fact) => <p key={fact} className="mt-0.5 text-content-muted">{fact}</p>)}
                      {run.errorMessage ? <p className="mt-1 text-state-error">{run.errorMessage}</p> : null}
                    </div>
                    <span className={`font-medium capitalize ${dailyRunTone(run.status)}`}>{run.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-content-muted">
                No daily runner result has been saved for this Steam connection yet.
              </p>
            )}
          </section>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(domains).map(([kind, label]) => {
              const run = health.runs?.find((item) => item.syncKind === kind);
              const success =
                kind === "library"
                  ? account.lastLibrarySyncAt
                  : kind === "wishlist"
                    ? account.lastWishlistSyncAt
                    : account.lastPriceSyncAt;
              const detail = formatSteamPhaseRunDetail(run);
              return (
                <div
                  key={kind}
                  className="rounded-lg border border-surface-border p-3"
                >
                  <p className="font-medium">{label}</p>
                  <p className="mt-1 text-xs text-content-muted">
                    Last complete success: {date(success)}
                  </p>
                  <p className="mt-1 text-xs text-content-muted">
                    Latest attempt:{" "}
                    {run
                      ? `${date(run.startedAt)} · ${run.status}`
                      : "Not recorded"}
                  </p>
                  {detail ? (
                    <p className="mt-1 text-xs text-content-muted">{detail}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {priceHealth ? (
            <div className="space-y-1 text-xs text-content-muted">
              <p>
                {priceHealth.observed || 0} of {priceHealth.eligible || 0}{" "}
                monitored games have saved observations;{" "}
                {priceHealth.fresh || 0} are fresh with no refresh error.
              </p>
              <p>
                {priceHealth.unchecked || 0} unchecked · {awaitingScheduled} awaiting
                scheduled check · {retrying} retrying · {verification} need offer
                verification · {priceHealth.unsupported || 0} unsupported.
              </p>
              {priceHealth.unresolved ? (
                <p>
                  {priceHealth.unresolved} local intentions need a Steam
                  identity and are outside price coverage.
                </p>
              ) : null}
              <p>
                Saved coverage and refresh issues can overlap. Existing
                observations remain available when an update fails.
              </p>
            </div>
          ) : null}
          {verification > 0 ? (
            <p className="text-xs text-content-muted">
              Some offers or package contents cannot be verified safely.
              Repeated refreshes may not resolve them; check the Steam store
              from the game details.
            </p>
          ) : null}
          {account.priceNextAttemptAt &&
          Date.parse(account.priceNextAttemptAt) > Date.now() ? (
            <p className="text-xs text-content-muted">
              Pricing is eligible to retry after{" "}
              {date(account.priceNextAttemptAt)}.{" "}
              {account.autoSyncEnabled
                ? "The next scheduled run after that time can retry due work."
                : "Daily sync is off. Use Refresh prices after that time to continue."}{" "}
              This is an eligibility time, not a scheduled start.
            </p>
          ) : null}
          {account.wishlistSyncStatus === "empty_unconfirmed" ? (
            <div className="text-state-warning">
              <p>
                Steam has not confirmed an empty Wishlist. Saved membership was
                preserved.
              </p>
              {confirmEmpty ? (
                <Button
                  className="mt-2"
                  variant="secondary"
                  size="sm"
                  disabled={working}
                  onClick={confirmEmpty}
                >
                  Confirm genuinely empty wishlist
                </Button>
              ) : null}
            </div>
          ) : null}
          {account.wishlistLastErrorMessage &&
          account.wishlistSyncStatus !== "empty_unconfirmed" ? (
            <p className="text-xs text-state-warning">
              {account.wishlistLastErrorMessage}
            </p>
          ) : null}
          {hasMissingMetadata ? (
            <p className="text-xs text-content-muted">
              Some artwork or catalog metadata is missing. Refresh metadata
              processes a small, durable Wishlist queue; price updates remain
              separate.
            </p>
          ) : null}
          {metadata ? (
            <p className="text-xs text-content-muted">
              {metadata.complete || 0} complete · {metadata.pending || 0} queued · {metadata.review || 0} need identity review · {metadata.unmatched || 0} unmatched.
              {metadata.failed ? ` ${metadata.failed} waiting to retry.` : ""}
            </p>
          ) : null}
          {metadata?.recentRuns?.[0] ? (
            <p className="text-xs text-content-muted">
              Last metadata run: {metadata.recentRuns[0].processed} processed, {metadata.recentRuns[0].completed} complete, {metadata.recentRuns[0].review} review, {metadata.recentRuns[0].unmatched} unmatched, {metadata.recentRuns[0].failed} failed.
            </p>
          ) : null}
          {job ? (
            <p className="text-xs text-content-muted">
              {job.total != null
                ? `${job.processed || 0} of ${job.total} items processed. `
                : ""}
              You can leave this page; the job continues in the background.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {onLibraryRefresh ? (
              <Button size="sm" disabled={working} onClick={onLibraryRefresh}>
                Refresh Library
              </Button>
            ) : null}
            {onMembershipRefresh ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={working}
                onClick={onMembershipRefresh}
              >
                Refresh membership
              </Button>
            ) : null}
            {onPriceRefresh ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={working}
                onClick={onPriceRefresh}
              >
                Refresh prices
              </Button>
            ) : null}
            {onMetadataRefresh ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={working}
                onClick={onMetadataRefresh}
              >
                Refresh metadata
              </Button>
            ) : null}
            {onMetadataBulkRefresh ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={working}
                onClick={onMetadataBulkRefresh}
              >
                Refresh all queued
              </Button>
            ) : null}
            {job ? (
              <Button
                size="sm"
                variant="dangerGhost"
                onClick={async () => {
                  try {
                    await cancelSteamLibrarySync(job.id);
                    await health.reload();
                  } catch (error) {
                    toast.error(error.message);
                  }
                }}
              >
                Cancel update
              </Button>
            ) : null}
            <Button as={Link} to="/activity" size="sm" variant="ghost">
              View activity
            </Button>
          </div>
          <p className="text-xs text-content-muted">
            Manual refresh is a recovery tool and respects freshness, provider
            limits and retry delays.
          </p>
        </div>
      ) : null}
    </section>
  );
}
