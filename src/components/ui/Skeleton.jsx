import React from "react";

export default function Skeleton({ className = "" }) {
  return (
    <div
      className={[
        "animate-pulse rounded-lg bg-surface-elevated/70",
        className,
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

