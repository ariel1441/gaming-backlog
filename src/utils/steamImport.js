const FILTERED_REASON_LABELS = {
  missing_title: "Missing title",
  possible_non_game: "Likely non-game",
  steam_bonus_content: "Bonus content",
  steam_demo: "Demo/prologue",
  steam_dlc: "DLC/add-on",
  steam_media: "Media extra",
  steam_playtest: "Playtest/beta",
  steam_server: "Server app",
  steam_soundtrack: "Soundtrack",
  steam_tool: "Tool/software",
};

export function filteredReasonLabel(reason) {
  return FILTERED_REASON_LABELS[reason] || "Likely non-game";
}

