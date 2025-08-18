// src/components/insights/ChartEmpty.jsx
import React from "react";

export default function ChartEmpty({
  message = "No data to display",
  minH = 220,
}) {
  return (
    <div
      className="flex items-center justify-center text-content-muted"
      style={{ minHeight: minH }}
      role="status"
      aria-live="polite"
    >
      <div className="text-sm">{message}</div>
    </div>
  );
}
