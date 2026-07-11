import React from "react";

const widths = {
  standard: "max-w-page",
  wide: "max-w-page-wide",
  full: "max-w-page-full",
};

export default function AppPage({
  as: Component = "main",
  width = "wide",
  className = "",
  children,
}) {
  return (
    <Component
      className={[
        "min-h-screen bg-surface-bg text-content-primary",
        className,
      ].join(" ")}
    >
      <div
        className={[
          "mx-auto w-full px-4 py-5 sm:px-6 sm:py-7 lg:px-8",
          widths[width] || widths.wide,
        ].join(" ")}
      >
        {children}
      </div>
    </Component>
  );
}
