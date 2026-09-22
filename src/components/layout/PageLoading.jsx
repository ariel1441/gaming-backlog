import React from "react";
import { ListLoadingSkeleton } from "./LoadingSkeletons";

export default function PageLoading({ rows = 4, className = "" }) {
  return <ListLoadingSkeleton rows={rows} className={className} />;
}
