import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button, Switch, useToast } from "../../components/ui";
import {
  updateSteamAccountSettings,
  cancelSteamLibrarySync,
} from "../../services/steamService";
import { useSteamExperience } from "./SteamExperienceContext";
import { relativeSavedTime } from "../../utils/steamPrice";

const domains = {
  library: "Library & activity",
  wishlist: "Wishlist membership",
  wishlist_prices: "Israel prices",
};
const date = (value) => (value ? new Date(value).toLocaleString() : "Not yet");

export default function SteamSyncStatus({
  savedAccount,
  priceHealth,
  onMembershipRefresh,
  onPriceRefresh,
  busy = false,
  confirmEmpty,
  hasMissingMetadata = false,
  diagnostics = false,
  onLibraryRefresh,
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
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-content-muted">
        <span>Saved Wishlist</span>
        <Button as={Link} to="/settings" variant="ghost" size="sm">
          Connect Steam
        </Button>
        {health.error ? <span>Sync status unavailable</span> : null}
      </div>
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
          {account.wishlistSyncStatus === "empty_unconfirmed" ? (
            <span className="text-state-warning">
              Membership needs attention
            </span>
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
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(domains).map(([kind, label]) => {
              const run = health.runs?.find((item) => item.syncKind === kind);
              const success =
                kind === "library"
                  ? account.lastLibrarySyncAt
                  : kind === "wishlist"
                    ? account.lastWishlistSyncAt
                    : account.lastPriceSyncAt;
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
                {priceHealth.unchecked || 0} not checked · {retrying} temporary
                issues · {verification} need offer verification ·{" "}
                {priceHealth.unsupported || 0} unsupported.
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
              Some artwork or metadata is missing. Price updates do not repair
              catalog metadata.
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
