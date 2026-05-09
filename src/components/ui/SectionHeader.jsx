import React from "react";

export default function SectionHeader({
  title,
  description,
  className = "",
}) {
  return (
    <div className={["mb-4", className].join(" ")}>
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-content-secondary">
        {title}
      </h3>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-content-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}
