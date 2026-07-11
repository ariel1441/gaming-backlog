import React from "react";
import Skeleton from "../ui/Skeleton";

export default function PageLoading({ rows = 4, className = "" }) {
  return (
    <div
      className={["space-y-3", className].join(" ")}
      role="status"
      aria-label="Loading"
      aria-busy="true"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-surface-border bg-surface-card p-4"
        >
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
