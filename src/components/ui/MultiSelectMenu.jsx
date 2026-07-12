import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import Button from "./Button";
import { TextInput } from "./inputs";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import PopoverPanel from "./PopoverPanel";

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
  ...props
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const optionRefs = useRef([]);
  const typeaheadRef = useRef({ value: "", timer: null });
  const [announcement, setAnnouncement] = useState("");
  const generatedId = useId();
  const controlId = id || `${generatedId}-control`;
  const listboxId = `${controlId}-listbox`;
  const selected = useMemo(
    () => values.map(normalizeOption).filter(Boolean),
    [values],
  );
  const selectedSet = useMemo(
    () => new Set(selected.map((value) => value.toLowerCase())),
    [selected],
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
    !allOptions.some(
      (option) => option.toLowerCase() === query.trim().toLowerCase(),
    );

  useDismissibleLayer({
    open,
    layerRef: ref,
    onDismiss: () => setOpen(false),
    restoreFocus: true,
  });

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => optionRefs.current[0]?.focus());
  }, [open]);

  const handleListKeyDown = (event) => {
    const currentIndex = optionRefs.current.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown")
      nextIndex = Math.min(filtered.length - 1, currentIndex + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = filtered.length - 1;
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const state = typeaheadRef.current;
      clearTimeout(state.timer);
      state.value += event.key.toLowerCase();
      const matchIndex = filtered.findIndex((option) =>
        option.toLowerCase().startsWith(state.value),
      );
      state.timer = setTimeout(() => {
        state.value = "";
      }, 600);
      if (matchIndex >= 0) optionRefs.current[matchIndex]?.focus();
      return;
    } else return;
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  const emit = (next) => {
    const seen = new Set();
    onChange?.(
      next.map(normalizeOption).filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );
  };

  const toggle = (value) => {
    const key = value.toLowerCase();
    if (selectedSet.has(key)) {
      emit(selected.filter((item) => item.toLowerCase() !== key));
      setAnnouncement(`${value} removed`);
    } else {
      emit([...selected, value]);
      setAnnouncement(`${value} selected`);
    }
  };

  const addCustom = () => {
    const value = normalizeOption(query);
    if (!value) return;
    emit([...selected, value]);
    setAnnouncement(`${value} added`);
    setQuery("");
  };

  const label = selected.length
    ? selected.length === 1
      ? selected[0]
      : `${selected.length} selected`
    : placeholder;

  return (
    <div ref={ref} className="relative">
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <button
        {...props}
        id={controlId}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => optionRefs.current[0]?.focus());
          }
        }}
        className={[
          "flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-input/55 px-3 py-2 text-left text-sm text-content-primary shadow-control-inset transition-colors",
          "hover:border-primary/35 hover:bg-surface-elevated focus:border-focus-border/70 focus:outline-none focus:ring-2 focus:ring-focus/20",
          disabled ? "cursor-not-allowed opacity-70" : "",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
      >
        <span
          className={
            selected.length ? "truncate" : "truncate text-content-muted"
          }
        >
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
              aria-label={`Remove ${value}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-secondary/35 bg-secondary/12 px-2.5 py-1 text-xs font-medium text-secondary-light hover:border-secondary/55 hover:bg-secondary/16"
            >
              <span className="truncate">{value}</span>
              <X className="h-3 w-3 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <PopoverPanel className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-tooltip">
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

          <div
            id={listboxId}
            className="max-h-56 space-y-1 overflow-auto pr-1"
            role="listbox"
            aria-labelledby={controlId}
            aria-multiselectable="true"
            onKeyDown={handleListKeyDown}
          >
            {filtered.map((option) => {
              const active = selectedSet.has(option.toLowerCase());
              return (
                <button
                  type="button"
                  key={option}
                  ref={(node) => {
                    optionRefs.current[filtered.indexOf(option)] = node;
                  }}
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
                        ? "border-action-primary bg-action-primary text-content-on-primary"
                        : "border-surface-border bg-surface-bg/70",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 whitespace-normal break-words">
                    {option}
                  </span>
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
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={addCustom}
              className="mt-3"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add "{query.trim()}"
            </Button>
          ) : null}
        </PopoverPanel>
      ) : null}
    </div>
  );
}
