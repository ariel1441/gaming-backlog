import React from "react";

const variants = {
  metadata:
    "border-metadata-border/70 bg-metadata-surface/75 text-metadata-text",
  genre:
    "border-integration-border/70 bg-integration-surface/80 text-integration-steam hover:border-integration-steam/70 hover:bg-integration-surface",
  primary:
    "border-primary/35 bg-primary/12 text-primary-light hover:border-primary/55 hover:bg-primary/16",
  integration:
    "border-integration-border/70 bg-integration-surface/80 text-integration-steam",
  info: "border-state-info/40 bg-state-info/12 text-state-info",
};

export default function Chip({
  as: Component = "span",
  variant = "metadata",
  className = "",
  children,
  ...props
}) {
  return (
    <Component
      {...props}
      className={[
        "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        variants[variant] || variants.metadata,
        className,
      ].join(" ")}
    >
      {children}
    </Component>
  );
}
