import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Inbox } from "lucide-react";
import { AppPage, PageError, PageLoading } from "../components/layout";
import {
  Badge,
  Button,
  EmptyState,
  SegmentedControl,
  useToast,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGames } from "../hooks/useGames";
import { useSteamExperience } from "../features/steam/SteamExperienceContext";
import SteamSyncStatus from "../features/steam/SteamSyncStatus";
import {
  activateActivityInbox,
  listActivityInbox,
  updateActivityInbox,
  updateActivityEvent,
} from "../services/activityService";
import { applySteamStatusSuggestion } from "../services/steamService";
import {
  activityEventsToSyncReview,
  buildSteamStatusSuggestionPayload,
} from "../utils/steamSync";
import {
  activityLabel,
  activityPriceChange,
  groupActivityDigests,
} from "../utils/activityInbox";
import { relativeSavedTime } from "../utils/steamPrice";
import { SteamSyncReviewModal } from "./SteamImport/SteamSyncReview";

const empty = {
  groups: [],
  counts: {},
  loading: true,
  error: "",
  snapshot: null,
  nextCursor: null,
};
const names = {
  steam_prices: "Wishlist price updates",
  steam_wishlist: "Wishlist updates",
  steam_library: "Library & activity",
};

export default function ActivityPage() {
  const { user } = useAuth();
  const health = useSteamExperience();
  return (
    <ActivityPageContent
      key={`${user?.id || "signed-out"}:${health.account?.id || "disconnected"}`}
    />
  );
}

function ActivityPageContent() {
  const { user, isAuthenticated, isGuest } = useAuth();
  const health = useSteamExperience();
  const { refresh: refreshGames } = useGames();
  const navigate = useNavigate();
  const toast = useToast();
  const enabled = isAuthenticated && !isGuest;
  const [section, setSection] = useState("updates");
  const [state, setState] = useState(empty);
  const [newUpdates, setNewUpdates] = useState(false);
  const [review, setReview] = useState(null);
  const [applying, setApplying] = useState(null);
  const [saving, setSaving] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sequence = useRef(0);
  const load = useCallback(
    async ({ append = false, quiet = false } = {}) => {
      if (!enabled) return;
      const current = ++sequence.current;
      const previous = stateRef.current;
      if (!quiet) setState((value) => ({ ...value, loading: true, error: "" }));
      try {
        const payload = await listActivityInbox({
          section,
          ...(append
            ? { snapshot: previous.snapshot, before: previous.nextCursor }
            : {}),
        });
        if (current !== sequence.current) return;
        if (quiet) {
          setNewUpdates(
            payload.snapshot !== previous.snapshot ||
              JSON.stringify(payload.counts) !==
                JSON.stringify(previous.counts),
          );
          return;
        }
        setState({
          ...payload,
          groups: append
            ? [...previous.groups, ...payload.groups]
            : payload.groups,
          loading: false,
          error: "",
        });
        setNewUpdates(false);
      } catch (error) {
        if (current === sequence.current)
          setState((value) => ({
            ...value,
            loading: false,
            error: error.message || "Could not load activity.",
          }));
      }
    },
    [enabled, section],
  );
  useEffect(() => {
    setState(empty);
    setReview(null);
    setNewUpdates(false);
    if (!enabled) return;
    let stopped = false;
    const controller = new AbortController();
    activateActivityInbox({ signal: controller.signal })
      .then(() => {
        if (!stopped) void load();
      })
      .catch((error) => {
        if (!stopped)
          setState({ ...empty, loading: false, error: error.message });
      });
    const check = () => {
      if (document.visibilityState !== "hidden" && !stateRef.current.loading)
        void load({ quiet: true });
    };
    const timer = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      controller.abort();
      sequence.current++;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [enabled, user?.id, health.account?.id, load]);
  const receipt = async (group, action) => {
    setSaving(true);
    try {
      await updateActivityInbox(
        group.events.map((event) => event.id),
        action,
      );
      setState((value) => ({
        ...value,
        groups:
          action === "dismiss"
            ? value.groups.filter((item) => item.id !== group.id)
            : value.groups.map((item) =>
                item.id === group.id ? { ...item, unseen: false } : item,
              ),
      }));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };
  const apply = async (item, options) => {
    setApplying(item.gameId);
    try {
      await applySteamStatusSuggestion(
        item.gameId,
        buildSteamStatusSuggestionPayload(item, options),
      );
      await refreshGames({ silent: true });
      setReview(null);
      await load();
      toast.success("Backlog updated.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setApplying(null);
    }
  };
  if (!enabled)
    return (
      <AppPage>
        <EmptyState
          icon={Inbox}
          title="Activity is private"
          description="Sign in with a saved account to view your Steam updates."
        />
      </AppPage>
    );
  return (
    <AppPage width="wide">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Activity</h1>
          <p className="mt-1 text-sm text-content-muted">
            Saved Steam updates and decisions, together in one place.
          </p>
        </div>
        <Button as={Link} to="/wishlist" variant="secondary">
          Open Wishlist
        </Button>
      </div>
      <SteamSyncStatus />
      <SegmentedControl
        value={section}
        onChange={setSection}
        ariaLabel="Activity section"
        options={[
          { value: "updates", label: "Recent updates" },
          {
            value: "attention",
            label: `Needs attention${state.counts.attention ? ` (${state.counts.attention})` : ""}`,
          },
        ]}
      />
      <p className="my-3 text-xs text-content-muted">
        {section === "updates"
          ? "Changes are grouped by saved run and game. Observed changes may have happened between checks. Historical updates start quietly."
          : "These are decisions, not unread notifications. Reading an item leaves its decision open."}
      </p>
      {newUpdates ? (
        <Button className="mb-4" variant="secondary" onClick={() => load()}>
          Show latest updates
        </Button>
      ) : null}
      {state.error ? (
        <PageError
          title="Could not update activity"
          description={state.error}
          onRetry={() => load()}
        />
      ) : null}
      {state.loading && !state.groups.length ? <PageLoading rows={3} /> : null}
      {!state.loading && !state.error && !state.groups.length ? (
        <EmptyState
          icon={Inbox}
          title={
            section === "attention"
              ? "Nothing needs your attention"
              : "No updates yet"
          }
          description="New saved changes will appear here after a background update. No manual sync is needed when daily execution is operating."
        />
      ) : null}
      <div className="space-y-6">
        {groupActivityDigests(state.groups).map((digest) => (
          <section key={digest.key}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">
                {names[digest.source] || "Steam updates"}
              </h2>
              <span className="text-xs text-content-muted">
                {digest.groups.length} grouped updates shown ·{" "}
                {relativeSavedTime(digest.observedAt)}
              </span>
            </div>
            <div className="space-y-2">
              {digest.groups.map((group) => {
                const event = group.events[0];
                const labels = [...new Set(group.events.map(activityLabel))];
                const price = activityPriceChange(event);
                return (
                  <article
                    key={group.id}
                    className="rounded-xl border border-surface-border bg-surface-card p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{event.title}</h3>
                      {group.unseen ? <Badge variant="info">New</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-content-secondary">
                      {labels.join(" · ")}
                      {price ? ` · ${price}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {section === "attention" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setReview(activityEventsToSyncReview(group.events))
                          }
                        >
                          Review decision
                        </Button>
                      ) : (
                        <Button
                          as={Link}
                          to={
                            event.wishlistItemId
                              ? `/wishlist?item=${event.wishlistItemId}`
                              : "/steam/library"
                          }
                          size="sm"
                          variant="ghost"
                        >
                          View game
                        </Button>
                      )}
                      {group.unseen ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => receipt(group, "mark_read")}
                        >
                          Mark read
                        </Button>
                      ) : null}
                      {section === "updates" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => receipt(group, "dismiss")}
                        >
                          Hide update
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {state.nextCursor ? (
        <Button
          className="mt-5"
          variant="secondary"
          disabled={state.loading}
          onClick={() => load({ append: true })}
        >
          {state.loading ? "Loading…" : "Load older updates"}
        </Button>
      ) : null}
      {review ? (
        <SteamSyncReviewModal
          review={review}
          applyingGameId={applying}
          onClose={() => setReview(null)}
          onApplyStatus={apply}
          onDismissItem={async (item) => {
            try {
              await updateActivityEvent(item.activityEventId, "dismiss");
              setReview(null);
              await load();
            } catch (error) {
              toast.error(error.message);
            }
          }}
          onReviewImport={() => {
            setReview(null);
            navigate("/steam/import");
          }}
        />
      ) : null}
    </AppPage>
  );
}
