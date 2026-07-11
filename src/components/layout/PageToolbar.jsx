import React from "react";

export default function PageToolbar({
  children,
  className = "",
  sticky = false,
}) {
  return (
    <section
      className={[
        "border-b border-surface-border py-4",
        sticky
          ? "sticky top-14 z-20 bg-surface-bg/95 backdrop-blur lg:top-0"
          : "",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}
