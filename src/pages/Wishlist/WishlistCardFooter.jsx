import React from "react";
import { CalendarDays, ExternalLink, Heart, ListPlus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, SelectMenu, TextInput } from "../../components/ui";
import GameSearchResult from "../../components/GameSearchResult";
import { searchGames } from "../../services/gameService";
import { rawgMetadataState, rawgMetadataStateLabel } from "../../utils/filterOptions";
import { isWishlistRawgMatchUnavailable } from "./wishlistPresentation";

const metadataStateClasses = {
  linked: "border-state-success/30 bg-state-success/10 text-state-success",
  pending: "border-primary/30 bg-primary/10 text-primary-light",
  missing: "border-content-muted/30 bg-content-muted/10 text-content-muted",
  review: "border-state-warning/35 bg-state-warning/10 text-state-warning",
  incomplete: "border-state-warning/35 bg-state-warning/10 text-state-warning",
  failed: "border-state-error/35 bg-state-error/10 text-state-error",
};

function formatDate(value) {
  if (!value) return "Date unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unknown" : date.toLocaleDateString();
}

export default function WishlistCardFooter({
  game,
  statusOptions = [],
  moveStatus,
  onMove,
  onMoveStatusChange,
  moving = false,
  preview = false,
  onRefreshMetadata,
  metadataRefreshing = false,
  onMatchRawg,
}) {
  const metadataState = rawgMetadataState(game);
  const metadataLabel = rawgMetadataStateLabel(metadataState);
  const [matchOpen, setMatchOpen] = React.useState(false);
  const [matchQuery, setMatchQuery] = React.useState(game.name || "");
  const [matchResults, setMatchResults] = React.useState([]);
  const [matchLoading, setMatchLoading] = React.useState(false);
  const [matchError, setMatchError] = React.useState("");
  const [matchingRawgId, setMatchingRawgId] = React.useState(null);
  React.useEffect(() => {
    if (!matchOpen) return undefined;
    const query = matchQuery.trim();
    if (query.length < 3) {
      setMatchResults([]);
      setMatchLoading(false);
      setMatchError("");
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setMatchLoading(true);
      setMatchError("");
      searchGames(query, { signal: controller.signal, wishlistItemId: game.wishlistItemId })
        .then((payload) => setMatchResults(Array.isArray(payload?.results) ? payload.results : []))
        .catch((error) => {
          if (error?.name !== "AbortError") setMatchError("Could not search RAWG right now.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setMatchLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [game.wishlistItemId, matchOpen, matchQuery]);

  const chooseMatch = async (result) => {
    const rawgId = Number(result?.rawg_id);
    if (!Number.isInteger(rawgId) || !onMatchRawg || isWishlistRawgMatchUnavailable(result, game)) return;
    setMatchingRawgId(rawgId);
    try {
      await onMatchRawg(game, rawgId);
      setMatchOpen(false);
    } catch (error) {
      setMatchError(error.message || "Could not save the RAWG match.");
    } finally {
      setMatchingRawgId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-content-muted">
        <span className="inline-flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-primary-light" aria-hidden="true" />
          {game.steamActive ? (game.providerOrder != null ? `Steam order ${game.providerOrder + 1}` : "Steam wishlist") : game.removalReason === "account_disconnected" ? "Previous Steam connection" : game.steamAppId ? "Removed from Steam" : "Local wishlist"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          Added {formatDate(game.dateAdded)}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${metadataStateClasses[metadataState] || metadataStateClasses.missing}`}
          aria-label={`RAWG metadata status: ${metadataLabel}`}
        >
          RAWG: {metadataLabel}
        </span>
        {!preview && game.inBacklog ? (
          <span className="inline-flex items-center rounded-full border border-state-success/30 bg-state-success/10 px-2 py-0.5 font-semibold text-state-success">
            Already in backlog
          </span>
        ) : null}
      </div>
      {!preview && !game.inBacklog ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => onMove?.(game)} disabled={moving} className="min-w-40 flex-1 sm:flex-none">
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            {moving ? "Moving..." : "Move to backlog"}
          </Button>
          <SelectMenu
            value={moveStatus}
            onChange={onMoveStatusChange}
            options={statusOptions.length ? statusOptions : [{ value: "planned", label: "planned" }]}
            aria-label={`Backlog status for ${game.name}`}
            className="min-w-36 flex-1 sm:w-44 sm:flex-none"
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {onRefreshMetadata ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onRefreshMetadata}
            disabled={metadataRefreshing}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {metadataRefreshing ? "Refreshing..." : "Refresh metadata"}
          </Button>
        ) : null}
        {onMatchRawg ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setMatchQuery(game.name || "");
              setMatchError("");
              setMatchOpen((value) => !value);
            }}
            disabled={metadataRefreshing || matchingRawgId != null}
            aria-expanded={matchOpen}
            aria-controls="wishlist-rawg-match-panel"
          >
            {game.rawgId || game.rawg_id ? "Change RAWG match" : "Match RAWG"}
          </Button>
        ) : null}
        {game.steamStoreUrl ? (
          <Button
            as="a"
            href={game.steamStoreUrl}
            target="_blank"
            rel="noreferrer"
            size="sm"
            variant="ghost"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Steam store
          </Button>
        ) : null}
        {preview ? (
          <Button as={Link} to="/wishlist" size="sm" variant="secondary">
            View Wishlist
          </Button>
        ) : null}
      </div>
      {matchOpen ? (
        <section
          id="wishlist-rawg-match-panel"
          aria-label="Choose RAWG match"
          className="rounded-panel border border-primary/30 bg-surface-card/55 p-3 shadow-sm shadow-primary/5 sm:p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-content-primary">Choose RAWG match</div>
              <p className="mt-1 text-xs leading-5 text-content-muted">
            Select the exact game. This changes metadata only; Steam membership and prices stay unchanged.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMatchOpen(false)}
              disabled={matchingRawgId != null}
              className="shrink-0"
            >
              Close
            </Button>
          </div>
          <TextInput
            type="search"
            value={matchQuery}
            onChange={(event) => setMatchQuery(event.target.value)}
            placeholder="Search RAWG..."
            className="mt-3 h-9"
            disabled={matchingRawgId != null}
            aria-label="Search RAWG games"
          />
          <div
            className="mt-3 space-y-2"
            aria-live="polite"
          >
            {matchResults.map((result) => (
              <GameSearchResult
                key={result.rawg_id}
                result={result}
                selected={Number(result.rawg_id) === Number(game.rawgId || game.rawg_id)}
                onSelect={chooseMatch}
                disabled={matchingRawgId != null}
                busy={matchingRawgId === Number(result.rawg_id)}
                disabledReason={isWishlistRawgMatchUnavailable(result, game) ? "Already matched" : ""}
              />
            ))}
            {matchLoading ? <p className="text-xs text-content-muted">Searching...</p> : null}
            {!matchLoading && !matchResults.length ? <p className="text-xs text-content-muted">{matchQuery.trim().length >= 3 ? "No matches found." : "Type at least 3 characters."}</p> : null}
            {matchError ? <p className="text-xs text-state-error">{matchError}</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
