import { CalendarDays, ExternalLink, Heart, ListPlus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, SelectMenu } from "../../components/ui";

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
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-muted">
        <span className="inline-flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-primary-light" aria-hidden="true" />
          {game.steamActive ? (game.providerOrder != null ? `Steam order ${game.providerOrder + 1}` : "Steam wishlist") : game.removalReason === "account_disconnected" ? "Previous Steam connection" : game.steamAppId ? "Removed from Steam" : "Local wishlist"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          Added {formatDate(game.dateAdded)}
        </span>
      </div>
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
        ) : !game.inBacklog ? (
          <>
            <SelectMenu
              value={moveStatus}
              onChange={onMoveStatusChange}
              options={statusOptions.length ? statusOptions : [{ value: "planned", label: "planned" }]}
              aria-label={`Backlog status for ${game.name}`}
              className="min-w-32"
            />
            <Button size="sm" variant="secondary" onClick={() => onMove?.(game)} disabled={moving}>
              <ListPlus className="h-4 w-4" aria-hidden="true" />
              {moving ? "Moving..." : "Move to backlog"}
            </Button>
          </>
        ) : (
          <span className="text-xs font-medium text-state-success">Already in backlog</span>
        )}
      </div>
    </div>
  );
}
