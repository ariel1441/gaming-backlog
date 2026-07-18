import React from "react";
import AuthModal from "../../components/AuthModal";
import GameModal from "../../components/GameModal";
import KeepDemoModal from "../../components/KeepDemoModal";
import OnboardingModal from "../../components/OnboardingModal";

export default function BacklogModals({
  selectedGame,
  onCloseSelectedGame,
  onSelectedGameUpdated,
  onSteamLinked,
  onEditSelectedGame,
  surpriseGame,
  onCloseSurpriseGame,
  onRefreshSurpriseGame,
  editingGame,
  onSubmitEditGame,
  onCancelEditGame,
  onEditDraftChange,
  editFormError,
  isEditing,
  statuses,
  allMyGenres,
  onAddToNextUp,
  onDeleteGame,
  showAuth,
  onCloseAuth,
  showOnboarding,
  onCloseOnboarding,
  onShowAuth,
  showKeepDemo,
  onCloseKeepDemo,
}) {
  const modalGame = selectedGame || editingGame;

  return (
    <>
      {modalGame && (
        <GameModal
          game={modalGame}
          onClose={() => {
            onCloseSelectedGame();
            onCancelEditGame();
          }}
          onGameRefresh={onSteamLinked}
          onEdit={onEditSelectedGame}
          onSubmitEdit={onSubmitEditGame}
          onCancelEdit={onCancelEditGame}
          onGameUpdated={onSelectedGameUpdated}
          startInEditMode={!!editingGame}
          onDraftChange={onEditDraftChange}
          formError={editFormError}
          isSubmitting={isEditing}
          statuses={statuses}
          allMyGenres={allMyGenres}
          onAddToNextUp={onAddToNextUp}
          onDelete={async (game) => {
            const deleted = await onDeleteGame?.(game.id);
            if (deleted) onCloseSelectedGame();
          }}
        />
      )}

      {surpriseGame && (
        <GameModal
          game={surpriseGame}
          onClose={onCloseSurpriseGame}
          onRefresh={onRefreshSurpriseGame}
          onGameRefresh={onSteamLinked}
        />
      )}

      {showAuth && <AuthModal onClose={onCloseAuth} />}

      {showOnboarding && (
        <OnboardingModal
          open={showOnboarding}
          onClose={onCloseOnboarding}
          onShowAuth={onShowAuth}
        />
      )}

      {showKeepDemo && (
        <KeepDemoModal open={showKeepDemo} onClose={onCloseKeepDemo} />
      )}
    </>
  );
}
