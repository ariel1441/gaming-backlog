import React, { useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import PopoverPanel from "./PopoverPanel";
import DropdownChevron from "./DropdownChevron";

export default function SelectMenu({
  id,
  value,
  options = [],
  placeholder = "Select",
  onChange,
  disabled = false,
  className = "",
  buttonClassName = "",
  ...props
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const optionRefs = useRef([]);
  const typeaheadRef = useRef({ value: "", timer: null });
  const generatedId = useId();
  const controlId = id || `${generatedId}-control`;
  const listboxId = `${controlId}-listbox`;
  const selected = options.find((option) => option.value === value);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  useDismissibleLayer({
    open,
    layerRef: ref,
    onDismiss: () => setOpen(false),
    restoreFocus: true,
  });

  useEffect(() => {
    if (!open) return;
    optionRefs.current[selectedIndex]?.focus();
  }, [open, selectedIndex]);

  const handleListKeyDown = (event) => {
    const currentIndex = optionRefs.current.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown")
      nextIndex = Math.min(options.length - 1, currentIndex + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const state = typeaheadRef.current;
      clearTimeout(state.timer);
      state.value += event.key.toLowerCase();
      const matchIndex = options.findIndex((option) =>
        String(option.label || option.value)
          .toLowerCase()
          .startsWith(state.value),
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

  return (
    <div ref={ref} className={["relative", className].join(" ")}>
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
          }
        }}
        className={[
          "flex min-h-10 w-full items-center justify-between gap-3 rounded-control border border-surface-border bg-surface-input/55 px-3 py-2 text-left text-sm text-content-primary shadow-control-inset transition-[background-color,border-color,box-shadow,transform]",
          "hover:border-primary/40 hover:bg-surface-selected/55 focus-visible:border-focus-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/20 active:translate-y-px aria-expanded:border-primary/55 aria-expanded:bg-surface-selected/70",
          disabled ? "cursor-not-allowed opacity-70" : "",
          buttonClassName,
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
      >
        <span className={selected ? "truncate" : "truncate text-content-muted"}>
          {selected?.buttonLabel || selected?.label || placeholder}
        </span>
        <DropdownChevron open={open} />
      </button>

      {open ? (
        <PopoverPanel
          padding="sm"
          radius="lg"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-tooltip max-h-72 overflow-y-auto"
        >
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={controlId}
            onKeyDown={handleListKeyDown}
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[options.indexOf(option)] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={option.disabled}
                  onClick={() => {
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-center justify-between gap-3 rounded-control border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/60 disabled:cursor-not-allowed disabled:opacity-55",
                    active
                      ? "border-primary/55 bg-surface-selected text-primary-light"
                      : "border-transparent text-content-secondary hover:border-primary/30 hover:bg-surface-selected/55 hover:text-primary-light",
                  ].join(" ")}
                >
                  <span className="min-w-0 whitespace-normal break-words">
                    {option.label}
                  </span>
                  {active ? <Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })}
          </div>
        </PopoverPanel>
      ) : null}
    </div>
  );
}
