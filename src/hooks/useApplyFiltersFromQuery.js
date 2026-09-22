import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useStatusGroups } from "../contexts/StatusGroupsContext";

export default function useApplyFiltersFromQuery({
  setSelectedStatuses,
  setSelectedGenres,
  setSelectedMyGenres,
  setDateFilter,
  setScoreFilter,
  setRatedOnly,
  setMissingEstimatesOnly,
  allStatuses = [],
}) {
  const [sp] = useSearchParams();
  const { rawStatusesForGroup, toGroup } = useStatusGroups();

  useEffect(() => {
    const group = sp.get("group");
    const status = sp.get("status");
    const genreType = sp.get("genreType");
    const genre = sp.get("genre");
    const dateType = sp.get("dateType");
    const year = sp.get("year");
    const active = sp.get("active");
    const missing = sp.get("missing");
    const insightsYear = sp.get("insightsYear");
    const score = sp.get("score");
    const rated = sp.get("rated");

    if (group) {
      const g = toGroup(group); // normalize "playing"/"Playing"/etc
      const statuses = g === "other"
        ? allStatuses.filter((value) => String(value).trim().toLowerCase() !== "wishlist" && toGroup(value) === "other")
        : rawStatusesForGroup(g);
      if (statuses.length) setSelectedStatuses(statuses);
    } else if (status) {
      setSelectedStatuses([status]);
    }

    if (genre && genreType === "rawg") setSelectedGenres([genre]);
    if (genre && genreType === "my") setSelectedMyGenres([genre]);

    if (setDateFilter) {
      if (
        (dateType === "added" || dateType === "started" || dateType === "finished") &&
        /^\d{4}$/.test(year || "")
      ) {
        setDateFilter({
          type: dateType === "added" ? "addedYear" : dateType === "started" ? "startedYear" : "finishedYear",
          year: Number(year),
        });
      } else if (active === "unfinished") {
        setDateFilter({ type: "activeUnfinished" });
      } else if (active === "olderThan6Months") {
        setDateFilter({ type: "activeOlderThanMonths", months: 6 });
      } else if (/^\d{4}$/.test(insightsYear || "")) {
        setDateFilter({ type: "touchedYear", year: Number(insightsYear) });
      }
    }
    if (setScoreFilter) {
      const value = score == null ? NaN : Number(score);
      setScoreFilter(
        Number.isFinite(value) && value >= 0 && value <= 10 && Number.isInteger(value * 2)
          ? value
          : null,
      );
    }
    if (setRatedOnly) setRatedOnly(rated === "true");
    if (setMissingEstimatesOnly) setMissingEstimatesOnly(missing === "estimates");
  }, [
    sp,
    rawStatusesForGroup,
    toGroup,
    setSelectedStatuses,
    setSelectedGenres,
    setSelectedMyGenres,
    setDateFilter,
    setScoreFilter,
    setRatedOnly,
    setMissingEstimatesOnly,
    allStatuses,
  ]);
}
