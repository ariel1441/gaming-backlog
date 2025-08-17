export default function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-surface-border bg-surface-card overflow-hidden">
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              "px-2.5 py-1 text-xs transition-colors",
              active
                ? "bg-primary text-black"
                : "text-content-secondary hover:bg-surface-elevated",
              i > 0 ? "border-l border-surface-border" : "",
            ].join(" ")}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
