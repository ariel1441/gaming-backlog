import React from "react";
import { ChevronDown } from "lucide-react";

export default function DropdownChevron({ open = false, className = "" }) {
  return (
    <ChevronDown
      className={[
        "h-4 w-4 shrink-0 text-content-muted transition-transform duration-200",
        open ? "rotate-180" : "",
        className,
      ].join(" ")}
      aria-hidden="true"
    />
  );
}
