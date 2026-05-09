import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export default function SelectMenu({
  id,
  value,
  options = [],
  placeholder = "Select",
  onChange,
  disabled = false,
  className = "",
  buttonClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className={["relative", className].join(" ")}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={[
          "flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-elevated/55 px-3 py-2 text-left text-sm text-content-primary shadow-inner shadow-black/10 transition-colors",
          "hover:border-primary/35 hover:bg-surface-elevated focus:border-secondary/70 focus:outline-none focus:ring-2 focus:ring-secondary/20",
          disabled ? "cursor-not-allowed opacity-70" : "",
          buttonClassName,
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "truncate" : "truncate text-content-muted"}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-content-muted transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-tooltip max-h-72 overflow-y-auto rounded-2xl border border-surface-border bg-surface-card p-1.5 shadow-2xl shadow-black/45">
          <div role="listbox" aria-labelledby={id}>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/15 text-primary-light ring-1 ring-inset ring-primary/25"
                      : "text-content-secondary hover:bg-surface-elevated/80 hover:text-content-primary",
                  ].join(" ")}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {active ? <Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
