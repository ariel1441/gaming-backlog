import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useStatusGroups } from "../contexts/StatusGroupsContext";

export default function useApplyFiltersFromQuery({
  setSelectedStatuses,
  setSelectedGenres,
  setSelectedMyGenres,
  setDateFilter,
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

    if (group) {
      const g = toGroup(group); // normalize "playing"/"Playing"/etc
      const statuses = rawStatusesForGroup(g);
      if (statuses.length) setSelectedStatuses(statuses);
    } else if (status) {
      setSelectedStatuses([status]);
    }

    if (genre && genreType === "rawg") setSelectedGenres([genre]);
    if (genre && genreType === "my") setSelectedMyGenres([genre]);

    if (setDateFilter) {
      if (
        (dateType === "started" || dateType === "finished") &&
        /^\d{4}$/.test(year || "")
      ) {
        setDateFilter({
          type: dateType === "started" ? "startedYear" : "finishedYear",
          year: Number(year),
        });
      } else if (active === "unfinished") {
        setDateFilter({ type: "activeUnfinished" });
      } else if (active === "olderThan6Months") {
        setDateFilter({ type: "activeOlderThanMonths", months: 6 });
      }
    }
  }, [
    sp,
    rawStatusesForGroup,
    toGroup,
    setSelectedStatuses,
    setSelectedGenres,
    setSelectedMyGenres,
    setDateFilter,
  ]);
}
