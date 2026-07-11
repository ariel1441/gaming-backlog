import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import PopoverPanel from "./PopoverPanel";

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
    else return;
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
          "flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-input/55 px-3 py-2 text-left text-sm text-content-primary shadow-control-inset transition-colors",
          "hover:border-primary/35 hover:bg-surface-elevated focus:border-focus-border/70 focus:outline-none focus:ring-2 focus:ring-focus/20",
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
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-content-muted transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open ? (
        <PopoverPanel
          padding="sm"
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
