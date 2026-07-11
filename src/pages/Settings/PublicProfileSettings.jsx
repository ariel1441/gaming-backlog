import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, ExternalLink, Globe } from "lucide-react";
import ProfileFavoritesEditor, {
  getFavoriteIds,
} from "../../components/ProfileFavoritesEditor";
import ProfileSnapshot from "../../components/ProfileSnapshot";
import PublicToggleCard from "../../components/PublicToggleCard";
import { Button, EmptyState, useToast } from "../../components/ui";

const MAX_FAVORITES = 5;

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function publicProfileUrl(username) {
  if (!username) return "";
  if (typeof window === "undefined") return `/u/${username}`;
  return `${window.location.origin}/u/${username}`;
}
export function PublicProfileSection({
  user,
  isGuest,
  games,
  updateFavorites,
}) {
  const toast = useToast();
  const initialFavoriteIds = useMemo(() => getFavoriteIds(games), [games]);
  const [favoriteIds, setFavoriteIds] = useState(initialFavoriteIds);
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [savingFavorites, setSavingFavorites] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");

  useEffect(() => {
    setFavoriteIds(initialFavoriteIds);
  }, [initialFavoriteIds]);

  if (isGuest) {
    return (
      <EmptyState
        icon={Globe}
        title="Public profile controls are off in demo mode."
        description="Demo sessions stay private, so sharing controls and public favorites are hidden here."
        action={
          <Button as={Link} to="/" variant="primary">
            Back to backlog
          </Button>
        }
      />
    );
  }

  const publicUrl = publicProfileUrl(user?.username);
  const isPublic = !!user?.is_public;
  const favoriteGames = favoriteIds
    .map((id) => games.find((game) => Number(game.id) === Number(id)))
    .filter(Boolean);
  const favoriteIdSet = new Set(favoriteIds.map(Number));
  const filteredGames = games
    .filter((game) => {
      const query = favoriteSearch.trim().toLowerCase();
      if (!query) return true;
      return String(game.name || "")
        .toLowerCase()
        .includes(query);
    })
    .slice(0, 40);
  const hasFavoriteChanges =
    JSON.stringify(favoriteIds.map(Number)) !==
    JSON.stringify(initialFavoriteIds.map(Number));

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
    setFavoriteIds((current) =>
      current.filter((item) => Number(item) !== Number(id)),
    );
  };

  const moveFavorite = (id, direction) => {
    setFavoriteError("");
    setFavoriteIds((current) => {
      const index = current.findIndex((item) => Number(item) === Number(id));
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length)
        return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const saveFavorites = async () => {
    try {
      setSavingFavorites(true);
      setFavoriteError("");
      await updateFavorites(favoriteIds.map(Number));
      toast.success("Favorite games saved.");
    } catch (err) {
      setFavoriteError(err.message || "Could not save favorite games.");
    } finally {
      setSavingFavorites(false);
    }
  };

  return (
    <div className="space-y-5">
      <PublicToggleCard />
      <ProfileFavoritesEditor
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
        disabled={!updateFavorites}
        hasChanges={hasFavoriteChanges}
        error={favoriteError}
      />
      <section className="rounded-2xl border border-surface-border bg-surface-card p-4 shadow-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Public preview</h2>
            <p className="mt-1 text-sm leading-6 text-content-muted">
              This mirrors the read-only profile people see when sharing is on.
            </p>
          </div>
          {isPublic ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={copyPublicUrl}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy
              </Button>
              <Button type="button" variant="secondary" onClick={openPublicUrl}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open
              </Button>
            </div>
          ) : null}
        </div>
        <ProfileSnapshot
          profile={user}
          games={games}
          publicUrl={isPublic ? publicUrl : ""}
          joinedAt={formatDate(user?.created_at)}
          variant="settingsPreview"
          isPublic={isPublic}
          onCopy={isPublic ? copyPublicUrl : undefined}
          onOpenPublic={isPublic ? openPublicUrl : undefined}
        />
      </section>
    </div>
  );
}
