import React from "react";

export default function DemoBanner({ onSave, onDiscard }) {
  return (
    <div className="w-full bg-primary-light text-content-inverse ring-1 ring-surface-border/35 shadow-sm">
      <div
        className="
          py-2.5 pr-4 sm:pr-6 md:pr-8
          pl-[var(--content-left,0px)]
          flex items-center justify-between gap-3
          flex-wrap sm:flex-nowrap
        "
      >
        <div className="min-w-0 pl-2 sm:pl-6">
          <span className="font-semibold">
            This is a temporary demo workspace.
          </span>
          <span className="hidden sm:inline text-sm opacity-90 ml-2">
            Save it to keep your games, order, and edits.
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 pr-2 sm:pr-6">
          <button
            onClick={onSave}
            className="rounded-md px-3 py-1.5 text-sm
                       bg-surface-card text-content-primary
                       border border-surface-border
                       hover:bg-surface-elevated
                       focus:outline-none focus:ring-2 focus:ring-primary/30
                       transition-colors"
          >
            Keep changes
          </button>

          <button
            onClick={onDiscard}
            className="rounded-md px-3 py-1.5 text-sm
                       bg-surface-card text-content-primary
                       border border-surface-border
                       hover:bg-surface-elevated
                       focus:outline-none focus:ring-2 focus:ring-primary/30
                       transition-colors"
          >
            Discard demo
          </button>
        </div>
      </div>
    </div>
  );
}
