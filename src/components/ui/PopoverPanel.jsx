import React from "react";

const paddingClasses = {
  none: "",
  sm: "p-1.5",
  md: "p-3",
  lg: "p-4",
};

const radiusClasses = {
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

const shadowClasses = {
  elevated: "shadow-elevated",
  menu: "shadow-menu",
};

export default function PopoverPanel({
  as: Component = "div",
  children,
  className = "",
  padding = "md",
  radius = "2xl",
  shadow = "menu",
  ...props
}) {
  return (
    <Component
      {...props}
      className={[
        "border border-surface-border bg-surface-card",
        paddingClasses[padding] || paddingClasses.md,
        radiusClasses[radius] || radiusClasses["2xl"],
        shadowClasses[shadow] || shadowClasses.menu,
        className,
      ].join(" ")}
    >
      {children}
    </Component>
  );
}
