import React from "react";
import { statusClassMap } from "../../utils/statusClassMap";

const fallbackClass =
  "border-content-muted/30 bg-content-muted/15 text-content-muted";

export default function StatusBadge({
  status,
  className = "",
  placeholder = "No status",
}) {
  const label = status || placeholder;
  const normalized =
    typeof label === "string"
      ? label.toLowerCase().trim().replaceAll("-", " ")
      : "";
  const toneClass = statusClassMap[normalized] || fallbackClass;

  return (
    <span
      className={[
        "inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
        toneClass,
        className,
      ].join(" ")}
      title={label}
    >
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
