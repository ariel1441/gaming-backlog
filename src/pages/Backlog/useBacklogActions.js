import { useState } from "react";
import { useConfirm, useToast } from "../../components/ui";
import {
  apiErrorMessage,
  buildAddGamePayload,
  buildEditGamePayload,
  emptyGameForm,
} from "./backlogForm";

export default function useBacklogActions({
  games,
  isAuthenticated,
  isGuest,
  addGame,
  editGame,
  removeGame,
  refresh,
  reorderGame,
  setShowAddForm,
}) {
  const confirm = useConfirm();
  const toast = useToast();

  const [newGame, setNewGame] = useState(emptyGameForm);
  const [surpriseGame, setSurpriseGame] = useState(null);
  const [editingGame, setEditingGame] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [addFormError, setAddFormError] = useState(null);
  const [editFormError, setEditFormError] = useState(null);
  const [deletingIds, setDeletingIds] = useState(() => new Set());

  const updateNewGame = (next) => {
    setAddFormError(null);
    setNewGame(next);
  };

  const handleDeleteGame = async (gameId) => {
    if (deletingIds.has(gameId)) return;
    if (!isAuthenticated) {
      toast.warning("Sign in required to delete games.");
      return;
    }
    const ok = await confirm({
      title: "Delete game?",
      message: "This removes the game from your backlog.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    try {
      setDeletingIds((prev) => new Set(prev).add(gameId));
      await removeGame(gameId);
      toast.success("Game deleted.");
    } catch (err) {
      console.error("Error deleting game:", err);
      toast.error("Failed to delete game. Please try again.");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(gameId);
        return next;
      });
    }
  };

  const handleSurpriseMe = () => {
    if (games.length > 0) {
      setSurpriseGame(games[Math.floor(Math.random() * games.length)]);
    }
  };

  const handleAddGame = async (event) => {
    event.preventDefault();
    if (isAdding) return;

    const result = buildAddGamePayload(newGame, games);
    if (!result.ok) {
      setAddFormError({ message: result.message, fields: result.fields || {} });
      toast.warning(result.message);
      return;
    }

    try {
      setIsAdding(true);
      setAddFormError(null);
      const created = await addGame(result.payload);

      setNewGame(emptyGameForm);
      setShowAddForm(false);

      if (isGuest || !created) {
        await refresh();
      }
    } catch (err) {
      console.error("Error adding game:", err);
      const message = apiErrorMessage(err, "Failed to add game. Please try again.");
      setAddFormError({ message, fields: {} });
      toast.error(message);
    } finally {
      setIsAdding(false);
    }
  };

  const startEditing = (game) => {
    if (!isAuthenticated) {
      toast.warning("Sign in required to edit games.");
      return;
    }
    setEditFormError(null);
    setEditingGame(game);
  };

  const handleEditGame = async (draft) => {
    if (isEditing) return;
    if (!isAuthenticated) {
      toast.warning("Sign in required to edit games.");
      return;
    }

    const original = editingGame || {};
    const result = buildEditGamePayload(draft, original);
    if (!result.ok) {
      setEditFormError({ message: result.message, fields: result.fields || {} });
      toast.warning(result.message);
      return;
    }

    try {
      setIsEditing(true);
      setEditFormError(null);
      await editGame(draft.id ?? original.id, result.payload);
      setEditingGame(null);
      toast.success("Game updated.");
    } catch (err) {
      console.error("Error updating game:", err);
      const message = apiErrorMessage(
        err,
        "Failed to update game. Please check your inputs and try again."
      );
      setEditFormError({ message, fields: {} });
      toast.error(message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleReorderGames = (gameId, targetIndex, status) =>
    reorderGame(gameId, targetIndex, status).catch(async (err) => {
      console.error("Failed to reorder game:", err);
      toast.error("Failed to reorder game. Please try again.");
      await refresh();
    });

  return {
    newGame,
    setNewGame: updateNewGame,
    surpriseGame,
    setSurpriseGame,
    editingGame,
    setEditingGame,
    handleDeleteGame,
    handleSurpriseMe,
    handleAddGame,
    startEditing,
    handleEditGame,
    handleReorderGames,
    isAdding,
    isEditing,
    addFormError,
    editFormError,
    clearEditFormError: () => setEditFormError(null),
    deletingIds,
  };
}
