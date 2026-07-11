const labels = {
  all: "All open",
  needs_match: "Needs match",
  matched: "Other ready",
  duplicates: "Already in backlog",
  newly_played: "Newly played",
  unplayed: "0h: plan to play",
  played_bit: "Under 2h: played a bit",
  playing: "Recently played",
  played_alot: "Played a lot",
  likely_finished: "Likely finished",
  filtered: "Likely non-games",
};

export function groupLabel(value) {
  return labels[value] || "current group";
}
