import React from "react";
import AdminLoginForm from "../../components/AdminLoginForm";
import EditGameForm from "../../components/EditGameForm";
import GameModal from "../../components/GameModal";
import KeepDemoModal from "../../components/KeepDemoModal";
import OnboardingModal from "../../components/OnboardingModal";
import PublicSettingsModal from "../../components/PublicSettingsModal";

export default function BacklogModals({
  selectedGame,
  onCloseSelectedGame,
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
  games,
  onUpdateFavorites,
  showAdminLogin,
  onCloseAdminLogin,
  showPublicSettings,
  onClosePublicSettings,
  showOnboarding,
  onCloseOnboarding,
  onShowAuth,
  showKeepDemo,
  onCloseKeepDemo,
}) {
  return (
    <>
      {selectedGame && (
        <GameModal game={selectedGame} onClose={onCloseSelectedGame} />
      )}

      {surpriseGame && (
        <GameModal
          game={surpriseGame}
          onClose={onCloseSurpriseGame}
          onRefresh={onRefreshSurpriseGame}
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
        />
      )}

      {showAdminLogin && <AdminLoginForm onClose={onCloseAdminLogin} />}

      {showPublicSettings && (
        <PublicSettingsModal
          open={showPublicSettings}
          onClose={onClosePublicSettings}
          games={games}
          onUpdateFavorites={onUpdateFavorites}
        />
      )}

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
