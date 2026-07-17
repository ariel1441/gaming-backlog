import React from "react";
import { X } from "lucide-react";
import IconButton from "./IconButton";

export default function SearchClearButton({
  label = "Clear search",
  className = "",
  ...props
}) {
  return (
    <IconButton
      icon={X}
      label={label}
      title={label}
      variant="ghost"
      size="sm"
      className={[
        "absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 border-transparent sm:h-8 sm:w-8",
        className,
      ].join(" ")}
      {...props}
    />
  );
}
