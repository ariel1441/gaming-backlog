import React from "react";
import AddGameForm from "../../components/AddGameForm";
import FilterPanel from "../../components/FilterPanel";

export default function BacklogPanels({
  visibility,
  refs,
  filters,
  addGame,
}) {
  return (
    <>
      {visibility.filters && (
        <FilterPanel
          filterRef={refs.filterRef}
          onClose={filters.onClose}
          allStatuses={filters.allStatuses}
          allGenres={filters.allGenres}
          allMyGenres={filters.allMyGenres}
          selectedStatuses={filters.selectedStatuses}
          selectedGenres={filters.selectedGenres}
          selectedMyGenres={filters.selectedMyGenres}
          hoursBounds={filters.hoursBounds}
          hoursRange={filters.hoursRange}
          setHoursRange={filters.setHoursRange}
          handleCheckboxToggle={filters.handleCheckboxToggle}
          setSelectedStatuses={filters.setSelectedStatuses}
          setSelectedGenres={filters.setSelectedGenres}
          setSelectedMyGenres={filters.setSelectedMyGenres}
          resetFilters={filters.reset}
          toggleStatus={filters.toggleStatus}
          toggleGenre={filters.toggleGenre}
          toggleMyGenre={filters.toggleMyGenre}
        />
      )}

      {visibility.addGame && (
        <AddGameForm
          addFormRef={refs.addFormRef}
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
      )}
    </>
  );
}
