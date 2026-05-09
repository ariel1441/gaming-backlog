import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import Button from "./Button";
import { TextInput } from "./inputs";

function normalizeOption(value) {
  return String(value || "").trim();
}

export default function MultiSelectMenu({
  id,
  values = [],
  options = [],
  placeholder = "Select",
  onChange,
  disabled = false,
  allowCustom = false,
  customPlaceholder = "Add custom value...",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const selected = useMemo(
    () => values.map(normalizeOption).filter(Boolean),
    [values]
  );
  const selectedSet = useMemo(
    () => new Set(selected.map((value) => value.toLowerCase())),
    [selected]
  );
  const allOptions = useMemo(() => {
    const seen = new Set();
    const out = [];

    for (const option of [...selected, ...options]) {
      const value = normalizeOption(option);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }

    return out;
  }, [options, selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((option) => option.toLowerCase().includes(q));
  }, [allOptions, query]);
  const canAddCustom =
    allowCustom &&
    query.trim() &&
    !allOptions.some((option) => option.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const emit = (next) => {
    const seen = new Set();
    onChange?.(
      next.map(normalizeOption).filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    );
  };

  const toggle = (value) => {
    const key = value.toLowerCase();
    if (selectedSet.has(key)) {
      emit(selected.filter((item) => item.toLowerCase() !== key));
    } else {
      emit([...selected, value]);
    }
  };

  const addCustom = () => {
    const value = normalizeOption(query);
    if (!value) return;
    emit([...selected, value]);
    setQuery("");
  };

  const label = selected.length
    ? selected.length === 1
      ? selected[0]
      : `${selected.length} selected`
    : placeholder;

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={[
          "flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-elevated/55 px-3 py-2 text-left text-sm text-content-primary shadow-inner shadow-black/10 transition-colors",
          "hover:border-primary/35 hover:bg-surface-elevated focus:border-secondary/70 focus:outline-none focus:ring-2 focus:ring-secondary/20",
          disabled ? "cursor-not-allowed opacity-70" : "",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected.length ? "truncate" : "truncate text-content-muted"}>
          {label}
        </span>
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-content-muted transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {selected.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((value) => (
            <button
              type="button"
              key={value}
              disabled={disabled}
              onClick={() => toggle(value)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-content-primary hover:border-primary/45"
            >
              <span className="truncate">{value}</span>
              <X className="h-3 w-3 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-tooltip rounded-2xl border border-surface-border bg-surface-card p-3 shadow-2xl shadow-black/45">
          <TextInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={customPlaceholder}
            className="mb-3 h-9"
            onKeyDown={(event) => {
              if (event.key === "Enter" && canAddCustom) {
                event.preventDefault();
                addCustom();
              }
            }}
          />

          <div className="max-h-56 space-y-1 overflow-auto pr-1" role="listbox" aria-labelledby={id}>
            {filtered.map((option) => {
              const active = selectedSet.has(option.toLowerCase());
              return (
                <button
                  type="button"
                  key={option}
                  role="option"
                  aria-selected={active}
                  onClick={() => toggle(option)}
                  className={[
                    "flex w-full min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-content-primary"
                      : "border-transparent text-content-secondary hover:border-surface-border hover:bg-surface-elevated/70 hover:text-content-primary",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-surface-border bg-surface-bg/70",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="truncate">{option}</span>
                </button>
              );
            })}
            {!filtered.length && !canAddCustom ? (
              <div className="rounded-xl border border-surface-border bg-surface-elevated/45 px-3 py-4 text-sm text-content-muted">
                No matches.
              </div>
            ) : null}
          </div>

          {canAddCustom ? (
            <Button type="button" size="sm" variant="secondary" onClick={addCustom} className="mt-3">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add "{query.trim()}"
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
