import React, { useEffect, useMemo, useState } from "react";
import ProfileFavoritesEditor, {
  getFavoriteIds,
} from "./ProfileFavoritesEditor";
import ProfileSnapshot from "./ProfileSnapshot";
import PublicToggleCard from "./PublicToggleCard";
import { useAuth } from "../contexts/AuthContext";
import { Modal, useToast } from "./ui";

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
    setFavoriteIds((current) =>
      current.filter((item) => Number(item) !== Number(id))
    );
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

export default PublicSettingsModal;
