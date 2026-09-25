import React from "react";
import Skeleton from "../ui/Skeleton";
import { GAME_ROW_COVER_SIZE } from "../gameRowCoverStyles";

function LoadingRegion({ label, className = "", children, ...props }) {
  return (
    <div
      className={className}
      role="status"
      aria-label={label}
      aria-busy="true"
      data-loading-skeleton
      {...props}
    >
      {children}
    </div>
  );
}

export function CollectionToolbarSkeleton() {
  return (
    <header className="-mx-3 mb-6 shrink-0 border-b border-surface-border/65 bg-surface-bg px-3 sm:-mx-6 sm:px-6 lg:-mx-5 lg:px-5">
      <div className="mx-auto max-w-[1760px] py-3.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(190px,auto)_minmax(280px,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="h-8 w-36 sm:w-44" />
            <Skeleton className="hidden h-4 w-16 sm:block" />
          </div>
          <Skeleton className="order-3 col-span-2 h-10 w-full rounded-control md:order-none md:col-span-1" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10 rounded-control" />
            <Skeleton className="h-10 w-10 rounded-control" />
          </div>
        </div>
        <div className="mt-3 flex gap-2 md:hidden">
          <Skeleton className="h-10 flex-1 rounded-control" />
          <Skeleton className="h-10 w-24 rounded-control" />
        </div>
        <div className="mt-3 hidden items-center justify-between gap-3 md:flex">
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-24 rounded-control" />
            ))}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-36 rounded-control" />
            <Skeleton className="h-10 w-44 rounded-control" />
          </div>
        </div>
      </div>
    </header>
  );
}

function CardSkeleton({ compact = false, collection = "backlog" }) {
  const isWishlist = collection === "wishlist";
  return (
    <div
      className="overflow-hidden rounded-2xl border border-surface-border bg-surface-card"
      data-skeleton-card
    >
      <Skeleton className={`${compact ? "h-44" : "h-64"} w-full rounded-none`} />
      <div className="space-y-3 p-4">
        <Skeleton className={`${compact ? "h-5" : "h-6"} w-3/4`} />
        <Skeleton className="h-4 w-2/5" />
        {isWishlist ? (
          <div className="space-y-2 pt-1" data-wishlist-price>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        ) : null}
        <div className="flex gap-2"><Skeleton className="h-7 w-20 rounded-full" /><Skeleton className="h-7 w-24 rounded-full" /></div>
      </div>
    </div>
  );
}

export function CollectionContentSkeleton({ viewMode = "grid", rows = 8, collection = "backlog" }) {
  if (viewMode === "table") {
    return (
      <>
        <div className="hidden overflow-hidden rounded-panel border border-surface-border bg-surface-card lg:block">
          <div className="flex h-11 items-center gap-5 border-b border-surface-border bg-surface-elevated px-4">
            {["w-56", "w-28", "w-40", "w-24", "w-20"].map((width, index) => <Skeleton key={index} className={`h-3 ${width}`} />)}
          </div>
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex h-[89px] items-center gap-5 border-b border-surface-border/70 px-4 last:border-0">
              <Skeleton className="h-16 w-11 shrink-0" /><Skeleton className="h-4 w-44" /><Skeleton className="h-7 w-28 rounded-full" /><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-20" /><Skeleton className="ml-auto h-9 w-16 rounded-control" />
            </div>
          ))}
        </div>
        <div className="space-y-3 px-2 lg:hidden">
          {Array.from({ length: rows }).map((_, index) => <RowSkeleton key={index} />)}
        </div>
      </>
    );
  }

  if (viewMode === "list") {
    return <div className="space-y-3 px-2 sm:px-0">{Array.from({ length: rows }).map((_, index) => <RowSkeleton key={index} />)}</div>;
  }

  const compact = viewMode === "compact";
  return (
    <div className={compact
      ? "mx-auto grid w-full max-w-[420px] grid-cols-[repeat(auto-fit,minmax(190px,1fr))] items-stretch gap-3 px-2 sm:max-w-none sm:grid-cols-[repeat(auto-fit,minmax(250px,1fr))] sm:px-0"
      : "mx-auto grid w-full max-w-[480px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3 px-2 sm:max-w-none sm:grid-cols-[repeat(auto-fit,minmax(360px,1fr))] sm:px-0"}
    >
      {Array.from({ length: rows }).map((_, index) => (
        <CardSkeleton key={index} compact={compact} collection={collection} />
      ))}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex min-h-[9rem] items-center gap-4 rounded-2xl border border-surface-border bg-surface-card p-3 sm:min-h-[11.5rem] sm:gap-5 sm:p-5">
      <Skeleton className={`${GAME_ROW_COVER_SIZE} shrink-0 rounded-xl`} />
      <div className="min-w-0 flex-1 space-y-3"><Skeleton className="h-5 w-3/5" /><Skeleton className="h-4 w-2/5" /><Skeleton className="h-7 w-24 rounded-full" /></div>
      <Skeleton className="hidden h-9 w-20 rounded-control sm:block" />
    </div>
  );
}

export function CollectionLoadingSkeleton({ viewMode = "grid", rows = 8, collection = "backlog" }) {
  return (
    <main className="min-h-screen overflow-x-clip bg-surface-bg px-3 pb-8 text-content-primary sm:px-6 lg:h-screen lg:min-h-0 lg:overflow-y-auto lg:px-5 lg:pb-8">
      <LoadingRegion
        label="Loading collection"
        className="contents"
        data-collection={collection}
        data-view-mode={viewMode}
      >
        <CollectionToolbarSkeleton />
        <div className="mx-auto w-full max-w-[1760px]">
          <CollectionContentSkeleton collection={collection} viewMode={viewMode} rows={rows} />
        </div>
      </LoadingRegion>
    </main>
  );
}

export function ListLoadingSkeleton({ rows = 4, className = "", label = "Loading" }) {
  return <LoadingRegion label={label} className={`space-y-3 ${className}`}>{Array.from({ length: rows }).map((_, index) => <RowSkeleton key={index} />)}</LoadingRegion>;
}

export function DashboardLoadingSkeleton({ dense = false }) {
  return (
    <LoadingRegion label="Loading page" className="space-y-7">
      <div className="flex flex-col gap-5 border-b border-surface-border/65 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-10 w-full max-w-md" /><Skeleton className="h-4 w-full max-w-2xl" /></div>
        <div className="flex gap-2"><Skeleton className="h-10 w-28 rounded-control" /><Skeleton className="h-10 w-36 rounded-control" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}</div>
      <Skeleton className="h-24 w-full rounded-panel" />
      {dense ? <ListLoadingSkeleton rows={4} /> : <div className="grid gap-5 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-64 rounded-2xl" />)}</div>}
    </LoadingRegion>
  );
}

export function SettingsLoadingSkeleton() {
  return (
    <LoadingRegion label="Loading settings" className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="space-y-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-11 w-full rounded-control" />)}</div>
      <div className="space-y-5"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full rounded-panel" /><Skeleton className="h-64 w-full rounded-panel" /></div>
    </LoadingRegion>
  );
}
