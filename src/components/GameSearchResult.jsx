import React from "react";

export default function GameSearchResult({ result, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className={[
        "flex w-full min-w-0 items-center gap-3 rounded-xl border p-2 text-left transition-colors",
        selected
          ? "border-primary/45 bg-primary/10"
          : "border-surface-border/70 bg-surface-bg/35 hover:border-primary/30 hover:bg-surface-elevated/55",
      ].join(" ")}
    >
      {result.cover ? (
        <img
          src={result.cover}
          alt=""
          className="h-14 w-11 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-14 w-11 shrink-0 rounded-lg bg-surface-elevated" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-content-primary">
          {result.name}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
          {result.released ? <span>{result.released}</span> : null}
          {result.rating ? <span>{result.rating}/5</span> : null}
          {result.metacritic ? <span>MC {result.metacritic}</span> : null}
        </div>
      </div>
    </button>
  );
}
