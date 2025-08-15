import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useStatusGroups } from "../contexts/StatusGroupsContext";

export default function useApplyFiltersFromQuery({
  setSelectedStatuses,
  setSelectedGenres,
  setSelectedMyGenres,
}) {
  const [sp] = useSearchParams();
  const { rawStatusesForGroup, toGroup } = useStatusGroups();

  useEffect(() => {
    const group = sp.get("group");
    const status = sp.get("status");
    const genreType = sp.get("genreType");
    const genre = sp.get("genre");

    if (group) {
      const g = toGroup(group); // normalize "playing"/"Playing"/etc
      const statuses = rawStatusesForGroup(g);
      if (statuses.length) setSelectedStatuses(statuses);
    } else if (status) {
      setSelectedStatuses([status]);
    }

    if (genre && genreType === "rawg") setSelectedGenres([genre]);
    if (genre && genreType === "my") setSelectedMyGenres([genre]);
  }, [
    sp,
    rawStatusesForGroup,
    toGroup,
    setSelectedStatuses,
    setSelectedGenres,
    setSelectedMyGenres,
  ]);
}
