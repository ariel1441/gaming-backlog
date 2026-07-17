import React from "react";
import { GameCover } from "./ui";

export default function GameSearchResult({ result, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className={[
        "flex w-full min-w-0 items-center gap-3 rounded-xl border p-2 text-left transition-colors",
        selected
          ? "border-primary/55 bg-surface-selected shadow-sm ring-1 ring-inset ring-primary/20"
          : "border-surface-border/70 bg-surface-bg/35 hover:border-primary/35 hover:bg-surface-selected/55",
      ].join(" ")}
    >
      <GameCover
        src={result.cover}
        name={result.name}
        className="h-14 w-11 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-semibold text-content-primary"
          title={result.name}
        >
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
