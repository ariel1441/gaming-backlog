import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  Gamepad2,
  Heart,
  Play,
  Tag,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  GameCover,
  IconButton,
  PopoverPanel,
  Sheet,
  Skeleton,
} from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import useMedia from "../../hooks/useMedia";
import { useStatuses } from "../../hooks/useStatuses";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import {
  activateActivityInbox,
  listActivityInbox,
  updateActivityInbox,
  hideOtherActivityUpdates,
} from "../../services/activityService";
import { useSteamExperience } from "../steam/SteamExperienceContext";
import {
  groupNotifications,
  notificationCategory,
  primaryNotificationEvent,
} from "./notificationGroups";
const NotificationActions = lazy(() => import("./NotificationActions"));

const Context = createContext(null);
const labels = {
  owned: "New games on Steam",
  started: "Started on Steam",
  playing: "Move to Playing?",
  prices: "Wishlist price drops & sales",
  updates: "Other updates",
};
const icons = {
  owned: Gamepad2,
  started: Play,
  playing: Play,
  prices: Tag,
  updates: Heart,
};
const empty = { groups: [], pages: {}, loading: true, error: "" };

export function NotificationsProvider({ children }) {
  const { user, isAuthenticated, isGuest } = useAuth();
  const { account } = useSteamExperience();
  const enabled = isAuthenticated && !isGuest;
  const [controller, setController] = useState(null);
  const scope = `${user?.id || ""}:${account?.id || ""}`;
  return (
    <Context.Provider
      value={enabled && controller?.scope === scope ? controller : null}
    >
      {children}
      {enabled ? (
        <NotificationController
          key={scope}
          scope={scope}
          publish={setController}
        />
      ) : null}
    </Context.Provider>
  );
}

export function NotificationBell({
  collapsed = false,
  compact = false,
  onOpen,
}) {
  const notifications = useContext(Context);
  if (!notifications) return null;
  const { open, toggle, pending, panelId } = notifications;
  return (
    <Button
      variant="ghost"
      onClick={(event) => {
        onOpen?.();
        toggle(event.currentTarget);
      }}
      aria-label={
        pending > 0
          ? `Notifications, ${pending} pending ${pending === 1 ? "decision" : "decisions"}`
          : "Notifications"
      }
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      className={
        compact || collapsed
          ? "relative !px-3"
          : "relative w-full !justify-start"
      }
    >
      <Bell className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!compact && !collapsed ? <span>Notifications</span> : null}
      {pending > 0 ? (
        <span
          className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-content-on-primary ring-2 ring-surface-bg"
          aria-hidden="true"
        >
          {pending > 99 ? "99+" : pending}
        </span>
      ) : null}
    </Button>
  );
}

function NotificationController({ scope, publish }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(empty);
  const [newUpdates, setNewUpdates] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(null);
  const countSequence = useRef(0);
  const { statuses } = useStatuses();
  const sequence = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;
  const stateRef = useRef(state);
  stateRef.current = state;
  const activated = useRef(false);
  const panelId = useId();
  const location = useLocation();
  const { account } = useSteamExperience();
  const enabled = Boolean(account?.id);
  const reload = useCallback(
    async ({ quiet = false, append = false } = {}) => {
      if (!enabled) {
        setPending(0);
        setState({ ...empty, loading: false });
        return;
      }
      const request = ++sequence.current;
      const countRequest = ++countSequence.current;
      if (!quiet) setState((value) => ({ ...value, loading: true, error: "" }));
      try {
        if (openRef.current && !activated.current) {
          await activateActivityInbox();
          if (request !== sequence.current) return;
          activated.current = true;
        }
        const previous = stateRef.current;
        const sections = ["attention", "updates"];
        const results = await Promise.all(
          sections.map((section) => {
            const cursor = previous.pages[section];
            if (append && !cursor?.nextCursor) return Promise.resolve(null);
            return listActivityInbox({
              section,
              limit: 50,
              ...(append
                ? { before: cursor.nextCursor, snapshot: cursor.snapshot }
                : {}),
            });
          }),
        );
        if (request !== sequence.current) return;
        if (
          countRequest === countSequence.current &&
          results[0]?.counts?.pendingDecisions != null
        )
          setPending(results[0].counts.pendingDecisions);
        const pages = { ...previous.pages };
        results.forEach((result, index) => {
          if (result) pages[sections[index]] = result;
        });
        const incoming = results.flatMap((result) => result?.groups || []);
        if (quiet && openRef.current) {
          if (
            incoming.some(
              (group) => !previous.groups.some((item) => item.id === group.id),
            )
          )
            setNewUpdates(true);
          return;
        }
        const groups = [
          ...new Map(
            [...(append ? previous.groups : []), ...incoming].map((group) => [
              group.id,
              group,
            ]),
          ).values(),
        ];
        setState({ groups, pages, loading: false, error: "" });
        setNewUpdates(false);
      } catch (error) {
        if (request === sequence.current)
          setState((value) => ({
            ...value,
            loading: false,
            error: error.message || "Could not load notifications.",
          }));
      }
    },
    [enabled],
  );
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== "hidden") void reload({ quiet: true });
    };
    void reload();
    const timer = setInterval(wake, 60_000);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      sequence.current++;
      countSequence.current++;
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [reload]);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  const toggle = useCallback((button) => {
    setAnchor(button);
    setOpen((value) => !value);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);
  const buckets = groupNotifications(state.groups);
  useEffect(() => {
    publish({ scope, open, toggle, pending, panelId });
  }, [scope, open, toggle, pending, panelId, publish]);
  const actionDone = (id) => {
    markRead(id);
    const request = ++countSequence.current;
    void listActivityInbox({ section: "attention", limit: 1 })
      .then((result) => {
        if (request === countSequence.current)
          setPending(result.counts.pendingDecisions);
      })
      .catch(() => {});
  };
  const markRead = (id) =>
    setState((value) => ({
      ...value,
      groups: value.groups.map((group) =>
        group.id === id ? { ...group, unseen: false } : group,
      ),
    }));
  const readBucket = async (bucket) => {
    const request = sequence.current;
    setReading(true);
    try {
      const ids = [
        ...new Set(
          bucket.groups
            .filter((group) => group.unseen)
            .flatMap((group) => group.events.map((event) => event.id)),
        ),
      ];
      for (let offset = 0; offset < ids.length; offset += 100) {
        if (request !== sequence.current) return;
        await updateActivityInbox(ids.slice(offset, offset + 100), "mark_read");
      }
      if (request === sequence.current)
        bucket.groups.forEach((group) => markRead(group.id));
    } catch (error) {
      if (request === sequence.current)
        setState((value) => ({ ...value, error: error.message }));
    } finally {
      setReading(false);
    }
  };
  const hideOther = async () => {
    const snapshot = state.pages.updates?.snapshot;
    if (!snapshot || reading) return;
    const request = sequence.current;
    setReading(true);
    try {
      const result = await hideOtherActivityUpdates(snapshot);
      if (request !== sequence.current) return;
      setState((value) => ({
        ...value,
        groups: value.groups.filter(
          (group) => notificationCategory(group) !== "updates",
        ),
        error: "",
      }));
      setNotice(
        `${result.updated} updates hidden. Your game decisions are still open.`,
      );
    } catch (error) {
      if (request === sequence.current)
        setState((value) => ({ ...value, error: error.message }));
    } finally {
      setReading(false);
    }
  };
  const body = (
    <>
      {notice ? (
        <p role="status" className="px-2 py-2 text-xs text-content-muted">
          {notice}
        </p>
      ) : null}
      {state.error ? (
        <div className="mb-3 space-y-2">
          <p role="alert" className="text-sm text-state-error">
            {state.error}
          </p>
          <Button size="sm" onClick={() => reload()}>
            Try again
          </Button>
        </div>
      ) : null}
      {newUpdates ? (
        <Button className="mb-3 w-full" size="sm" onClick={() => reload()}>
          Show new updates
        </Button>
      ) : null}
      {state.loading && !state.groups.length ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {!state.loading && !state.error && !buckets.length ? (
        <EmptyState
          icon={CheckCheck}
          title="You're all caught up"
          description={
            enabled
              ? "New games, play suggestions and Wishlist updates will appear here."
              : "Connect Steam in Settings to receive game updates."
          }
        />
      ) : null}
      <div className="divide-y divide-surface-border/60">
        {buckets.map((bucket) => {
          const Icon = icons[bucket.category];
          return (
            <details
              key={bucket.category}
              className="group py-2"
              onToggle={(event) => {
                if (event.target !== event.currentTarget) return;
                const value = event.currentTarget.open;
                setExpanded((current) => ({
                  ...current,
                  [bucket.category]: value,
                }));
              }}
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:bg-surface-elevated/60 [&::-webkit-details-marker]:hidden">
                <span className="rounded-xl bg-primary/10 p-2.5 text-primary-light">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {labels[bucket.category]}
                  <span className="mt-0.5 block text-xs font-normal text-content-muted">
                    {bucket.groups.length}{" "}
                    {bucket.groups.length === 1 ? "update" : "updates"}
                  </span>
                </span>
                {bucket.unseen ? <Badge variant="info">New</Badge> : null}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-content-muted group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              {["prices", "updates"].includes(bucket.category) &&
              (bucket.unseen || bucket.category === "updates") ? (
                <div className="flex items-center justify-end gap-2 px-2 pt-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    {bucket.unseen ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={reading}
                        onClick={() => readBucket(bucket)}
                      >
                        Mark read
                      </Button>
                    ) : null}
                    {bucket.category === "updates" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={reading}
                        onClick={hideOther}
                      >
                        Hide all updates
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="divide-y divide-surface-border/50 px-2">
                {bucket.groups.map((group) => (
                  <article
                    key={group.id}
                    className="space-y-2 py-4"
                    aria-label={primaryNotificationEvent(group)?.title}
                  >
                    <div className="flex items-center gap-3">
                      {primaryNotificationEvent(group)?.eventType !==
                      "wishlist_priority_changed" ? (
                        <GameCover
                          src={primaryNotificationEvent(group)?.cover}
                          artwork
                          name={primaryNotificationEvent(group)?.title}
                          className="h-12 w-16 shrink-0 rounded-lg"
                          fallbackClassName="!p-0 [&_svg]:hidden [&_span]:!h-8 [&_span]:!w-8 [&_span]:!text-xs"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold text-content-primary">
                          {primaryNotificationEvent(group)?.title}
                        </h3>
                        <NotificationTime
                          value={
                            group.observedAt ||
                            primaryNotificationEvent(group)?.observedAt
                          }
                        />
                      </div>
                    </div>
                    <Suspense fallback={<p role="status" className="text-sm text-content-muted">Loading actions…</p>}>
                    <NotificationActions
                      group={group}
                      expanded={expanded[bucket.category]}
                      statuses={statuses}
                      onDone={actionDone}
                      onNavigate={close}
                    />
                    </Suspense>
                  </article>
                ))}
              </div>
            </details>
          );
        })}
      </div>
      {Object.values(state.pages).some((page) => page.nextCursor) ? (
        <Button
          size="sm"
          className="mt-3 w-full"
          disabled={state.loading}
          onClick={() => reload({ append: true })}
        >
          Load older updates
        </Button>
      ) : null}
    </>
  );
  return open ? (
    <NotificationPanel
      panelId={panelId}
      anchor={anchor}
      close={close}
      pending={pending}
    >
      {body}
    </NotificationPanel>
  ) : null;
}

function NotificationTime({ value }) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return null;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const label =
    date.toDateString() === today.toDateString()
      ? "Today"
      : date.toDateString() === yesterday.toDateString()
        ? "Yesterday"
        : date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            ...(date.getFullYear() !== today.getFullYear()
              ? { year: "numeric" }
              : {}),
          });
  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString()}
      className="mt-1 block text-xs text-content-muted"
    >
      {label}
    </time>
  );
}

function NotificationPanel({ panelId, anchor, close, children, pending }) {
  const description =
    pending == null
      ? "Checking pending decisions…"
      : pending > 0
        ? `${pending} ${pending === 1 ? "decision" : "decisions"} waiting`
        : "No decisions waiting";
  const desktop = useMedia("(min-width: 1024px)");
  const panel = useRef(null);
  const [bounds, setBounds] = useState(() => anchor?.getBoundingClientRect());
  useEffect(() => {
    const reposition = () => setBounds(anchor?.getBoundingClientRect());
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [anchor]);
  useDismissibleLayer({
    open: desktop,
    layerRef: panel,
    onDismiss: close,
    restoreFocus: true,
  });
  useEffect(() => {
    if (desktop) panel.current?.querySelector("button")?.focus();
  }, [desktop]);
  const footer = (
    <div className="flex items-center justify-between gap-2 text-xs text-content-muted">
      <span>Hours & achievements update quietly.</span>
      <Link
        to="/activity"
        onClick={close}
        className="shrink-0 rounded p-2 text-content-secondary hover:text-primary-light focus-visible:ring-2 focus-visible:ring-focus"
      >
        History
      </Link>
    </div>
  );
  if (!desktop)
    return (
      <Sheet
        title="Notifications"
        description={description}
        onClose={close}
        closeLabel="Close notifications"
        footer={footer}
      >
        <div id={panelId}>{children}</div>
      </Sheet>
    );
  const top = Math.max(12, (bounds?.bottom || 56) + 8);
  return createPortal(
    <PopoverPanel
      ref={panel}
      id={panelId}
      role="dialog"
      aria-labelledby={`${panelId}-title`}
      padding="none"
      className="fixed z-50 flex w-[500px] flex-col overflow-hidden"
      style={{
        left: Math.max(
          12,
          Math.min(
            (bounds?.right || window.innerWidth - 12) - 500,
            window.innerWidth - 512,
          ),
        ),
        top,
        maxHeight: `min(44rem, calc(100dvh - ${top + 12}px))`,
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-surface-border/60 px-5 py-4">
        <div>
          <h2 id={`${panelId}-title`} className="text-lg font-semibold">
            Notifications
          </h2>
          <p className="mt-0.5 text-xs text-content-muted">{description}</p>
        </div>
        <IconButton
          label="Close notifications"
          variant="ghost"
          onClick={close}
        />
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-3 py-2">
        {children}
      </div>
      <div className="border-t border-surface-border/60 px-4 py-2">
        {footer}
      </div>
    </PopoverPanel>,
    document.body,
  );
}
