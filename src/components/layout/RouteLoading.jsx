import React from "react";
import Skeleton from "../ui/Skeleton";
import AppPage from "./AppPage";

export default function RouteLoading() {
  return (
    <AppPage width="wide">
      <div
        className="space-y-7"
        role="status"
        aria-label="Loading page"
        aria-busy="true"
      >
        <div className="flex flex-col gap-5 border-b border-surface-border/65 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-control" />
            <Skeleton className="h-10 w-36 rounded-control" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>

        <Skeleton className="h-24 w-full rounded-panel" />

        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    </AppPage>
  );
}
