import React from "react";

export default function Field({
  id,
  label,
  error,
  help,
  required,
  children,
  className = "",
}) {
  return (
    <div className={["space-y-1.5", className].join(" ")}>
      {label ? (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-content-secondary"
        >
          {label}
          {required ? <span className="text-state-error"> *</span> : null}
        </label>
      ) : null}
      {children}
      {help && !error ? (
        <p className="text-xs leading-5 text-content-muted">{help}</p>
      ) : null}
      {error ? <p className="text-xs leading-5 text-state-error">{error}</p> : null}
    </div>
  );
}
