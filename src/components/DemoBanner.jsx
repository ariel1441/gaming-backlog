import React from "react";

export default function DemoBanner({ onSave, onDiscard }) {
  return (
    <div className="w-full bg-primary-light text-content-inverse ring-1 ring-black/10 shadow-sm">
      <div
        className="
          py-2.5 pr-4 sm:pr-6 md:pr-8
          pl-[var(--content-left,0px)]
          flex items-center justify-between gap-3
          flex-wrap sm:flex-nowrap
        "
      >
        {/* left: message */}
        <div className="min-w-0 pl-2 sm:pl-6">
          <span className="font-semibold">
            You're exploring a demo workspace.
          </span>
          <span className="hidden sm:inline text-sm opacity-90 ml-2">
            Add games, reorder, and view insights freely.
          </span>
        </div>

        {/* right: actions */}
        <div className="flex items-center gap-2 shrink-0 pr-2 sm:pr-6">
          {/* solid blue */}
          <button
            onClick={onSave}
            className="rounded-md px-3 py-1.5 text-sm
                       bg-surface-card text-content-primary
                       border border-surface-border
                       hover:bg-surface-elevated
                       focus:outline-none focus:ring-2 focus:ring-primary/30
                       transition-colors"
          >
            Save as my account
          </button>

          {/* blue outline */}
          <button
            onClick={onDiscard}
            className="rounded-md px-3 py-1.5 text-sm
                       bg-surface-card text-content-primary
                       border border-surface-border
                       hover:bg-surface-elevated
                       focus:outline-none focus:ring-2 focus:ring-primary/30
                       transition-colors"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
