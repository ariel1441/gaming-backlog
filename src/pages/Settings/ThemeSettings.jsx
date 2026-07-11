import { Check, Palette } from "lucide-react";
import { useTheme } from "../../theme";

function ThemePreview({ theme, selected, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(theme.id)}
      data-theme={theme.id}
      className={[
        "group relative overflow-hidden rounded-card border bg-surface-card p-4 text-left text-content-primary shadow-control transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg",
        selected
          ? "border-primary shadow-glow-primary"
          : "border-surface-border hover:border-surface-border-strong hover:bg-surface-hover",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-content-primary">
            {theme.name}
          </div>
          <div className="mt-1 text-xs leading-5 text-content-muted">
            {theme.description}
          </div>
        </div>
        <span
          className={[
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
            selected
              ? "border-primary bg-action-primary text-content-on-primary"
              : "border-surface-border bg-surface-input text-transparent group-hover:border-surface-border-strong",
          ].join(" ")}
          aria-hidden="true"
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </div>

      <div
        className="mt-4 overflow-hidden rounded-control border border-surface-border bg-surface-bg"
        aria-hidden="true"
      >
        <div className="flex h-20">
          <div className="w-12 border-r border-surface-border bg-surface-sidebar p-2">
            <div className="h-5 w-5 rounded-md bg-primary shadow-active-navigation" />
            <div className="mt-3 h-1.5 rounded-full bg-content-muted/35" />
            <div className="mt-2 h-1.5 w-3/4 rounded-full bg-content-muted/20" />
          </div>
          <div className="min-w-0 flex-1 p-3">
            <div className="h-2 w-20 rounded-full bg-content-primary/85" />
            <div className="mt-2 h-1.5 w-28 rounded-full bg-content-muted/45" />
            <div className="mt-3 flex gap-2">
              <div className="h-7 flex-1 rounded-md border border-surface-border bg-surface-card" />
              <div className="h-7 w-14 rounded-md bg-action-primary shadow-glow-primary" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-surface-border bg-surface-elevated px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-state-success" />
          <span className="h-2.5 w-2.5 rounded-full bg-state-warning" />
          <span className="h-2.5 w-2.5 rounded-full bg-state-error" />
          <span className="ml-auto h-2 w-7 rounded-full bg-primary/75" />
          <span className="h-2 w-7 rounded-full bg-secondary/75" />
        </div>
      </div>
    </button>
  );
}

export function ThemeSettings() {
  const { themeId, themes, setTheme } = useTheme();

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-panel">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-content-primary">
          <Palette className="h-5 w-5 text-content-muted" aria-hidden="true" />
          Appearance
        </h2>
        <p className="mt-1 text-sm leading-6 text-content-muted">
          Choose the visual theme used across the app. Your selection is saved
          on this device and applied immediately.
        </p>
      </div>

      <div
        className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        role="radiogroup"
        aria-label="Application theme"
      >
        {themes.map((theme) => (
          <ThemePreview
            key={theme.id}
            theme={theme}
            selected={theme.id === themeId}
            onSelect={setTheme}
          />
        ))}
      </div>
    </section>
  );
}
