import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Heart,
  Search,
  X,
} from "lucide-react";
import ProfileSnapshot from "./ProfileSnapshot";
import PublicToggleCard from "./PublicToggleCard";
import { useAuth } from "../contexts/AuthContext";
import { Button, Modal, StatusBadge, TextInput, useToast } from "./ui";

const MAX_FAVORITES = 5;

const PublicSettingsModal = ({
  open,
  onClose,
  games = [],
  onUpdateFavorites,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const initialFavoriteIds = useMemo(() => getFavoriteIds(games), [games]);
  const [favoriteIds, setFavoriteIds] = useState(initialFavoriteIds);
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [savingFavorites, setSavingFavorites] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");

  useEffect(() => {
    setFavoriteIds(initialFavoriteIds);
  }, [initialFavoriteIds]);

  if (!open) return null;

  const publicUrl =
    typeof window !== "undefined" && user?.username
      ? `${window.location.origin}/u/${user.username}`
      : "";
  const joinedAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const isPublic = !!user?.is_public;

  const copyPublicUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public profile link copied.");
    } catch {
      toast.info(publicUrl, {
        title: "Copy this public profile link",
        duration: 7000,
      });
    }
  };

  const openPublicUrl = () => {
    if (!publicUrl) return;
    window.open(publicUrl, "_blank", "noopener,noreferrer");
  };

  const favoriteGames = favoriteIds
    .map((id) => games.find((game) => Number(game.id) === Number(id)))
    .filter(Boolean);
  const favoriteIdSet = new Set(favoriteIds.map(Number));
  const filteredGames = games
    .filter((game) => {
      const query = favoriteSearch.trim().toLowerCase();
      if (!query) return true;
      return String(game.name || "").toLowerCase().includes(query);
    })
    .slice(0, 40);
  const hasFavoriteChanges =
    JSON.stringify(favoriteIds.map(Number)) !==
    JSON.stringify(initialFavoriteIds.map(Number));

  const addFavorite = (game) => {
    const id = Number(game.id);
    if (!Number.isFinite(id) || favoriteIdSet.has(id)) return;
    if (favoriteIds.length >= MAX_FAVORITES) {
      toast.info("Remove a favorite before adding another one.", {
        title: "Favorite slots are full",
      });
      return;
    }
    setFavoriteError("");
    setFavoriteIds((current) => [...current, id]);
  };

  const removeFavorite = (id) => {
    setFavoriteError("");
    setFavoriteIds((current) => current.filter((item) => Number(item) !== Number(id)));
  };

  const moveFavorite = (id, direction) => {
    setFavoriteError("");
    setFavoriteIds((current) => {
      const index = current.findIndex((item) => Number(item) === Number(id));
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const saveFavorites = async () => {
    if (!onUpdateFavorites) return;
    try {
      setSavingFavorites(true);
      setFavoriteError("");
      await onUpdateFavorites(favoriteIds.map(Number));
      toast.success("Favorite games saved.");
    } catch (err) {
      setFavoriteError(err.message || "Could not save favorite games.");
    } finally {
      setSavingFavorites(false);
    }
  };

  return (
    <Modal
      title="Public Profile"
      description="Control sharing and preview how your profile appears to other people."
      onClose={onClose}
      maxWidth="max-w-6xl"
    >
      <div className="space-y-5">
        <PublicToggleCard />
        <FavoriteGamesEditor
          games={filteredGames}
          favoriteGames={favoriteGames}
          favoriteIds={favoriteIds}
          favoriteIdSet={favoriteIdSet}
          search={favoriteSearch}
          setSearch={setFavoriteSearch}
          addFavorite={addFavorite}
          removeFavorite={removeFavorite}
          moveFavorite={moveFavorite}
          onSave={saveFavorites}
          saving={savingFavorites}
          disabled={!onUpdateFavorites}
          hasChanges={hasFavoriteChanges}
          error={favoriteError}
        />
        <ProfileSnapshot
          profile={user}
          games={games}
          publicUrl={isPublic ? publicUrl : ""}
          joinedAt={joinedAt}
          variant="settingsPreview"
          isPublic={isPublic}
          onCopy={isPublic ? copyPublicUrl : undefined}
          onOpenPublic={isPublic ? openPublicUrl : undefined}
        />
      </div>
    </Modal>
  );
};

function getFavoriteIds(games) {
  return [...(Array.isArray(games) ? games : [])]
    .filter((game) => {
      const rank = Number(game?.favorite_rank);
      return Number.isInteger(rank) && rank >= 1 && rank <= MAX_FAVORITES;
    })
    .sort((a, b) => Number(a.favorite_rank) - Number(b.favorite_rank))
    .map((game) => Number(game.id));
}

function FavoriteGamesEditor({
  games,
  favoriteGames,
  favoriteIds,
  favoriteIdSet,
  search,
  setSearch,
  addFavorite,
  removeFavorite,
  moveFavorite,
  onSave,
  saving,
  disabled,
  hasChanges,
  error,
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-content-primary">
            <Heart className="h-4 w-4 text-content-muted" aria-hidden="true" />
            Favorite games
          </h3>
          <p className="mt-1 text-sm text-content-muted">
            Pick up to {MAX_FAVORITES} games from your backlog for the profile poster row.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={onSave}
          disabled={disabled || saving || !hasChanges}
        >
          {saving ? "Saving..." : "Save favorites"}
        </Button>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-state-error/40 bg-state-error/10 px-3 py-2 text-sm text-state-error">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
            Selected
          </div>
          <div className="grid gap-2">
            {Array.from({ length: MAX_FAVORITES }).map((_, index) => {
              const game = favoriteGames[index];
              return game ? (
                <FavoriteSlot
                  key={game.id}
                  game={game}
                  rank={index + 1}
                  canMoveUp={index > 0}
                  canMoveDown={index < favoriteGames.length - 1}
                  onMoveUp={() => moveFavorite(game.id, -1)}
                  onMoveDown={() => moveFavorite(game.id, 1)}
                  onRemove={() => removeFavorite(game.id)}
                />
              ) : (
                <div
                  key={`empty-favorite-${index}`}
                  className="flex min-h-16 items-center gap-3 rounded-xl border border-dashed border-surface-border bg-surface-bg/35 px-3 py-2 text-sm text-content-muted"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface-card text-xs font-semibold">
                    {index + 1}
                  </span>
                  Empty favorite slot
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-content-muted">
            Search backlog
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
              aria-hidden="true"
            />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search games to favorite..."
              className="pl-9"
            />
          </div>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {games.length ? (
              games.map((game) => (
                <FavoriteCandidate
                  key={game.id}
                  game={game}
                  selected={favoriteIdSet.has(Number(game.id))}
                  full={favoriteIds.length >= MAX_FAVORITES}
                  onAdd={() => addFavorite(game)}
                />
              ))
            ) : (
              <div className="rounded-xl border border-surface-border bg-surface-bg/35 px-3 py-5 text-sm text-content-muted">
                No games match this search.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FavoriteSlot({
  game,
  rank,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-surface-border bg-surface-bg/35 p-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-surface-card text-xs font-semibold text-content-muted">
        {rank}
      </span>
      <GameThumb game={game} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-content-primary">
          {game.name}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
          {game.status ? <StatusBadge status={game.status} /> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label={`Move ${game.name} up`}
          title={`Move ${game.name} up`}
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label={`Move ${game.name} down`}
          title={`Move ${game.name} down`}
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove ${game.name} from favorites`}
          title={`Remove ${game.name} from favorites`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function FavoriteCandidate({ game, selected, full, onAdd }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={selected || full}
      className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-surface-border bg-surface-bg/35 p-2 text-left transition-colors hover:bg-surface-elevated/60 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <GameThumb game={game} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-content-primary">
          {game.name}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
          {game.status ? <StatusBadge status={game.status} /> : null}
        </div>
      </div>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-surface-card text-content-muted">
        {selected ? (
          <Check className="h-4 w-4 text-state-success" aria-hidden="true" />
        ) : (
          <Heart className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

function GameThumb({ game }) {
  return game.cover ? (
    <img
      src={game.cover}
      alt=""
      loading="lazy"
      className="h-14 w-10 shrink-0 rounded object-cover"
    />
  ) : (
    <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-surface-elevated text-xs font-semibold text-content-muted">
      {String(game.name || "?").charAt(0)}
    </div>
  );
}

export default PublicSettingsModal;
