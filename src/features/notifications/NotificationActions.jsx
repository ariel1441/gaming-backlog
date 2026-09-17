import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink } from "lucide-react";
import {
  Button,
  Checkbox,
  SelectMenu,
  TextInput,
  useConfirm,
} from "../../components/ui";
import { useGames } from "../../hooks/useGames";
import { useAuth } from "../../contexts/AuthContext";
import {
  applySteamStatusSuggestion,
  addSteamCandidateToBacklog,
  attachSteamCandidate,
  listSteamLinkCandidates,
  updateSteamImportCandidate,
} from "../../services/steamService";
import {
  updateActivityEvent,
  updateActivityInbox,
} from "../../services/activityService";
import { moveWishlistToBacklog, retireWishlistIntention } from "../../services/wishlistService";
import { invalidateWishlistCache } from "../../services/wishlistCache";
import { buildSteamStatusSuggestionPayload } from "../../utils/steamSync";
import { activityLabel, activityPriceChange } from "../../utils/activityInbox";
import { canEditGame } from "../../utils/permissions";
import { buildDisplayGames } from "../../utils/gameList";
import { statusOption, statusDisplayLabel } from "../../utils/statusDisplay";
import {
  notificationCategory,
  primaryNotificationEvent,
} from "./notificationGroups";

export default function NotificationActions({
  group,
  expanded,
  statuses,
  onDone,
  onNavigate,
}) {
  const event = primaryNotificationEvent(group);
  const category = notificationCategory(group);
  const acquisition = ["owned", "started"].includes(category);
  const { games, refresh } = useGames();
  const { user, isAuthenticated } = useAuth();
  const confirm = useConfirm();
  const id = useId();
  const [status, setStatus] = useState("");
  const [chooseStatus, setChooseStatus] = useState(false);
  const [target, setTarget] = useState("");
  const [query, setQuery] = useState("");
  const [linking, setLinking] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [checking, setChecking] = useState(acquisition);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [removeWishlist, setRemoveWishlist] = useState(false);
  const [retirementRetry, setRetirementRetry] = useState(null);
  const [resultExpanded, setResultExpanded] = useState(true);
  const resultRef = useRef(null);
  useEffect(() => {
    setResultExpanded(true);
    if (!result || retirementRetry || busy || result.includes("could not"))
      return;
    const timer = setTimeout(() => {
      if (resultRef.current?.contains(document.activeElement))
        resultRef.current.querySelector("summary")?.focus();
      setResultExpanded(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [result, retirementRetry, busy]);
  const locked = useRef(false);
  const mounted = useRef(true);
  const gameId = event.gameId || event.payload?.gameId;
  const game = games.find((item) => Number(item.id) === Number(gameId));
  const appId = String(event.externalId || event.payload?.steamAppId || "");
  const wishlist = event.wishlistContext;
  const legacyWishlist = candidate?.linkedGameStatus?.trim().toLowerCase() === 'wishlist';
  const statusOptions = statuses
    .filter((value) => value.toLowerCase() !== "wishlist")
    .map(statusOption);
  const defaultPlaying = category === "started" && !chooseStatus;
  const targetStatus = defaultPlaying ? "playing" : status;
  const matched =
    (legacyWishlist && wishlist?.id) || (candidate?.proposedCatalogGameId &&
    ["pending", "accepted"].includes(candidate.importStatus));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!acquisition || !expanded) return;
    const controller = new AbortController();
    setChecking(true);
    listSteamLinkCandidates(
      { appId, limit: 1 },
      { signal: controller.signal },
    )
      .then(({ results }) => {
        if (!controller.signal.aborted) {
          setCandidate(
            results?.find((item) => String(item.steamAppId) === appId) || null,
          );
          setError("");
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [appId, acquisition, expanded, lookupAttempt]);

  const dismissDecision = async () => {
    for (const item of group.events.filter(
      (item) => item.source === "steam_library" && item.state === "open",
    )) {
      if (!mounted.current) return;
      await updateActivityEvent(item.id, "dismiss");
    }
  };
  const perform = async (work) => {
    if (locked.current || !mounted.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const message = await work();
      if (!mounted.current) return;
      setResult(message);
      onDone(group.id);
      void refresh({ silent: true }).catch(() => {});
    } catch (err) {
      if (mounted.current)
        setError(err.message || "Could not save. Try again.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const finishDecision = async (message) => {
    try {
      await dismissDecision();
    } catch {
      return `${message} The notification could not be cleared; it may appear again.`;
    }
    return message;
  };
  const retire = async (savedGameId) => {
    if (!mounted.current) return;
    let linkedId = savedGameId;
    if (!linkedId) {
      const { results } = await listSteamLinkCandidates({
        appId,
        limit: 1,
      });
      linkedId = results?.find(
        (item) => String(item.steamAppId) === appId,
      )?.linkedGameId;
    }
    if (!mounted.current) return;
    if (!linkedId) throw new Error("Could not confirm the saved Backlog link.");
    await retireWishlistIntention(wishlist.id, linkedId);
  };
  // Never offer a second import when a secondary Wishlist write fails.
  const finishAcquisition = async (
    message,
    savedGameId,
    { decisionResolved = false } = {},
  ) => {
    invalidateWishlistCache();
    if (removeWishlist && wishlist?.localActive && mounted.current) {
      try {
        await retire(savedGameId);
      } catch {
        if (mounted.current)
          setRetirementRetry({ gameId: savedGameId, message, decisionResolved });
        return `${message} Your Wishlist reminder is still saved.`;
      }
    }
    return decisionResolved ? message : finishDecision(message);
  };
  const add = () =>
    perform(async () => {
      if (legacyWishlist && wishlist?.id) {
        const response = await moveWishlistToBacklog(wishlist.id, targetStatus);
        return finishAcquisition(`Added to Backlog · ${statusDisplayLabel(targetStatus)}`, response.gameId);
      }
      const response = await addSteamCandidateToBacklog(candidate.id, {
        status: targetStatus,
        activityEventId: event.id,
      });
      if (!response.imported?.length && !response.attached?.length)
        throw new Error(
          "This game could not be added. Check its match in More options.",
        );
      return finishAcquisition(
        response.attached?.length
          ? "Linked to your existing game. Its status was kept."
          : `Added to Backlog · ${statusDisplayLabel(targetStatus)}`,
        response.gameId || response.imported?.[0]?.gameId,
        { decisionResolved: true },
      );
    });
  const availableGames = buildDisplayGames({
    games: games.filter((item) =>
      canEditGame({ user, game: item, isAuthenticated }),
    ),
    searchQuery: query,
    sortKey: "name",
  });
  const dontAdd = () =>
    perform(async () => {
      await dismissDecision();
      return "Not added. Still available in Steam Library.";
    });
  const ignoreGame = async () => {
    if (
      !(await confirm({
        title: "Ignore this Steam game?",
        message:
          "Hide this game from Steam review and stop its play suggestions. You can restore it in Steam Library. Your Backlog and Wishlist are kept.",
        confirmLabel: "Ignore game",
      })) ||
      !mounted.current
    )
      return;
    await perform(async () => {
      await updateSteamImportCandidate(candidate.id, { action: "ignore" });
      return finishDecision(
        "Game ignored. Restore it from Steam Library whenever you want.",
      );
    });
  };
  const ownedContext = wishlist?.removedFromSteam && event.nowOwned;
  return (
    <div className="space-y-3">
      {result ? (
        <details
          ref={resultRef}
          open={resultExpanded}
          onToggle={(event) => {
            if (event.target === event.currentTarget)
              setResultExpanded(event.currentTarget.open);
          }}
        >
          <summary className="cursor-pointer rounded py-1 text-xs text-content-muted focus-visible:ring-2 focus-visible:ring-focus">
            {retirementRetry || result.includes("could not")
              ? "Saved with follow-up"
              : "Completed"}{" "}
            · {resultExpanded ? "Hide result" : "Show result"}
          </summary>
          <p
            role="status"
            className="flex items-start gap-2 text-sm text-state-success"
          >
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {result}
          </p>
          {retirementRetry ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    await retire(retirementRetry.gameId);
                    if (mounted.current) setRetirementRetry(null);
                    const message = `${retirementRetry.message} Wishlist reminder removed.`;
                    return retirementRetry.decisionResolved
                      ? message
                      : finishDecision(message);
                  })
                }
              >
                Retry Wishlist removal
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    setRetirementRetry(null);
                    return retirementRetry.decisionResolved
                      ? retirementRetry.message
                      : finishDecision(retirementRetry.message);
                  })
                }
              >
                Keep reminder
              </Button>
            </div>
          ) : null}
        </details>
      ) : category === "playing" ? (
        <>
          <p className="text-sm text-content-muted">
            {ownedContext ? "Now owned · removed from Steam Wishlist. " : ""}
            Steam shows play activity
            {Number(event.payload?.playtimeMinutes) > 0
              ? ` · ${(event.payload.playtimeMinutes / 60).toFixed(1)} hours total`
              : ""}
            .
          </p>
          <p className="text-sm text-content-secondary">
            Current status:{" "}
            <span className="font-medium">
              {game
                ? statusDisplayLabel(game.status)
                : "Game no longer in Backlog"}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {canEditGame({ user, game, isAuthenticated }) &&
            game.status !== "playing" ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    const result = await applySteamStatusSuggestion(
                      gameId,
                      buildSteamStatusSuggestionPayload({
                        ...event.payload,
                        activityEventId: event.id,
                      }, { setStartedAt: !game?.started_at }),
                    );
                    return finishDecision(result?.game?.startedAt
                      ? `Moved to Playing. Started date: ${result.game.startedAt}.`
                      : "Moved to Playing. Existing dates were kept.");
                  })
                }
              >
                Accept Playing
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await dismissDecision();
                  return "Current status kept.";
                })
              }
            >
              {game?.status === "playing"
                ? "Already playing · dismiss"
                : "Keep current status"}
            </Button>
          </div>
        </>
      ) : acquisition ? (
        <>
          {ownedContext ? (
            <p className="text-sm text-content-muted">
              Now owned · removed from Steam Wishlist.
            </p>
          ) : null}
          {category === "started" ? (
            <p className="text-sm text-content-secondary">
              You started playing on Steam
              {Number(event.payload?.playtimeMinutes) > 0
                ? ` · ${(event.payload.playtimeMinutes / 60).toFixed(1)} hours total`
                : ""}
              . Add it to track your progress.
            </p>
          ) : null}
          {checking ? (
            <p role="status" className="text-sm text-content-muted">
              Checking saved game details…
            </p>
          ) : candidate?.linkedGameId && !legacyWishlist ? (
            <>
              <p className="text-sm text-state-success">
                Already in Backlog · {candidate.linkedGameName}
              </p>
              <div className="flex flex-wrap gap-2">
                {wishlist?.localActive ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        await retire(candidate.linkedGameId);
                        return finishDecision(
                          "Wishlist reminder removed. Your Backlog game was kept.",
                        );
                      })
                    }
                  >
                    Remove Wishlist reminder
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    perform(async () =>
                      finishDecision(
                        "Already in Backlog. Suggestion dismissed.",
                      ),
                    )
                  }
                >
                  Dismiss suggestion
                </Button>
              </div>
            </>
          ) : (
            <>
              {wishlist?.localActive ? (
                <Checkbox
                  checked={removeWishlist}
                  onChange={setRemoveWishlist}
                  disabled={busy}
                  label={
                    wishlist.steamActive
                      ? "Also clear my local Wishlist reminder"
                      : "Also remove from my Wishlist"
                  }
                  description={
                    wishlist.steamActive
                      ? "Your Wishlist on Steam stays unchanged."
                      : undefined
                  }
                />
              ) : null}
              {matched ? (
                <>
                  {!defaultPlaying ? (
                    <label
                      htmlFor={`${id}-status`}
                      className="block text-xs text-content-muted"
                    >
                      Backlog status
                    </label>
                  ) : null}
                  <div
                    className={`grid grid-cols-2 items-start gap-2 ${defaultPlaying ? "" : "sm:grid-cols-[minmax(0,1fr)_auto_auto]"}`}
                  >
                    {!defaultPlaying ? (
                      <SelectMenu
                        id={`${id}-status`}
                        aria-label="Backlog status"
                        value={status}
                        disabled={busy}
                        onChange={setStatus}
                        options={statusOptions}
                        placeholder="Choose status"
                        className="col-span-2 min-w-0 sm:col-span-1"
                      />
                    ) : null}
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!targetStatus || busy}
                      onClick={add}
                    >
                      {busy
                        ? "Saving…"
                        : defaultPlaying
                          ? "Add as Playing"
                          : "Add to Backlog"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={dontAdd}
                    >
                      Don’t add
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-content-muted">
                    Choose a catalog match before adding this game.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      as={Link}
                      to="/steam/import"
                      size="sm"
                      onClick={onNavigate}
                    >
                      Match review
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={dontAdd}
                    >
                      Don’t add
                    </Button>
                  </div>
                </div>
              )}
              <details className="text-sm">
                <summary className="w-fit cursor-pointer rounded py-2 text-content-muted hover:text-content-primary focus-visible:ring-2 focus-visible:ring-focus">
                  More options
                </summary>
                <div className="space-y-3 pb-1">
                  {candidate?.proposedCatalogName ? (
                    <p className="text-xs text-content-muted">
                      Catalog match: {candidate.proposedCatalogName}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {category === "started" && matched ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setChooseStatus(!chooseStatus)}
                      >
                        {chooseStatus
                          ? "Suggest Playing"
                          : "Choose another status"}
                      </Button>
                    ) : null}
                    {candidate ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setLinking(!linking)}
                        aria-expanded={linking}
                      >
                        Link existing game
                      </Button>
                    ) : null}
                    {matched ? (
                      <Button
                        as={Link}
                        to="/steam/import"
                        size="sm"
                        variant="ghost"
                        onClick={onNavigate}
                      >
                        Change match
                      </Button>
                    ) : null}
                    {candidate ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={ignoreGame}
                      >
                        Ignore this game
                      </Button>
                    ) : null}
                  </div>
                  {linking ? (
                    <div className="space-y-2">
                      <label htmlFor={`${id}-search`}>
                        Find a Backlog game
                      </label>
                      <TextInput
                        id={`${id}-search`}
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setTarget("");
                        }}
                        placeholder="Search your games"
                      />
                      <SelectMenu
                        aria-label="Existing Backlog game"
                        value={target}
                        onChange={setTarget}
                        disabled={busy}
                        placeholder="Choose game"
                        options={availableGames.map((item) => ({
                          value: String(item.id),
                          label: `${item.name} · ${statusDisplayLabel(item.status)}`,
                        }))}
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!target || busy}
                        onClick={() =>
                          perform(async () => {
                            const response = await attachSteamCandidate(
                              candidate.id,
                              Number(target),
                            );
                            if (!response?.attached)
                              throw new Error(
                                "The game could not be linked. Refresh and try again.",
                              );
                            return finishAcquisition(
                              "Linked to your Backlog game. Its status was kept.",
                              response.gameId,
                            );
                          })
                        }
                      >
                        Confirm link
                      </Button>
                    </div>
                  ) : null}
                </div>
              </details>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-content-secondary">
            {[...new Set(group.events.map(activityLabel))].join(" · ")}
            {activityPriceChange(event)
              ? ` · ${activityPriceChange(event)}`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {/^\d+$/.test(appId) ? (
              <Button
                as="a"
                href={`https://store.steampowered.com/app/${appId}/?cc=il`}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                variant="primary"
              >
                Open store{" "}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : null}
            {event.wishlistItemId ? (
              <Button
                as={Link}
                to={`/wishlist?item=${event.wishlistItemId}`}
                size="sm"
                variant="ghost"
                onClick={onNavigate}
              >
                View details
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await updateActivityInbox(
                    group.events.map((item) => item.id),
                    "dismiss",
                  );
                  return "Update hidden.";
                })
              }
            >
              Hide update
            </Button>
          </div>
        </>
      )}
      {error ? (
        <div role="alert" className="space-y-2 text-sm text-state-error">
          <p>{error}</p>
          {acquisition && !result && !candidate ? (
            <Button
              size="sm"
              onClick={() => setLookupAttempt((value) => value + 1)}
            >
              Retry game details
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
