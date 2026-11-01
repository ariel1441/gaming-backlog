const labels = {
  all: "All open",
  needs_match: "Needs match",
  matched: "Other ready",
  duplicates: "Already in backlog",
  newly_played: "Newly played",
  unplayed: "0h: Planned",
  played_bit: "Under 2h: played a bit",
  playing: "Recently played",
  played_alot: "Recorded playtime (legacy suggestion)",
  likely_finished: "Completion estimate (legacy suggestion)",
  filtered: "Likely non-games",
};

export function groupLabel(value) {
  return labels[value] || "current group";
}
