import React from "react";
import AddGameForm from "../../components/AddGameForm";

export default function BacklogPanels({ showAddGame, addFormRef, addGame }) {
  if (!showAddGame) return null;

  return (
    <AddGameForm
      addFormRef={addFormRef}
      newGame={addGame.newGame}
      setNewGame={addGame.setNewGame}
      handleAddGame={addGame.handleSubmit}
      isSubmitting={addGame.isSubmitting}
      allStatuses={addGame.allStatuses}
      statusesLoading={addGame.statusesLoading}
      statusesError={addGame.statusesError}
      refreshStatuses={addGame.refreshStatuses}
      allMyGenres={addGame.allMyGenres}
      formError={addGame.formError}
      onClose={addGame.onClose}
    />
  );
}
