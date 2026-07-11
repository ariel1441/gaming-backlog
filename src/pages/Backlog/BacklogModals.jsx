import React from "react";
import AdminLoginForm from "../../components/AdminLoginForm";
import EditGameForm from "../../components/EditGameForm";
import GameModal from "../../components/GameModal";
import KeepDemoModal from "../../components/KeepDemoModal";
import OnboardingModal from "../../components/OnboardingModal";

export default function BacklogModals({
  selectedGame,
  onCloseSelectedGame,
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
  showAdminLogin,
  onCloseAdminLogin,
  showOnboarding,
  onCloseOnboarding,
  onShowAuth,
  showKeepDemo,
  onCloseKeepDemo,
}) {
  return (
    <>
      {selectedGame && (
        <GameModal
          game={selectedGame}
          onClose={onCloseSelectedGame}
          onGameRefresh={onSteamLinked}
          onEdit={onEditSelectedGame}
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

      {editingGame && (
        <EditGameForm
          game={editingGame}
          onSubmit={onSubmitEditGame}
          onCancel={onCancelEditGame}
          onDraftChange={onEditDraftChange}
          formError={editFormError}
          isSubmitting={isEditing}
          statuses={statuses}
          allMyGenres={allMyGenres}
          onSteamLinked={onSteamLinked}
        />
      )}

      {showAdminLogin && <AdminLoginForm onClose={onCloseAdminLogin} />}

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
