import React, { forwardRef } from "react";

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

const PopoverPanel = forwardRef(function PopoverPanel(
  {
    as: Component = "div",
    children,
    className = "",
    padding = "md",
    radius = "2xl",
    shadow = "menu",
    ...props
  },
  ref,
) {
  return (
    <Component
      ref={ref}
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
});

export default PopoverPanel;
