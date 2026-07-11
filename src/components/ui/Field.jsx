import React, { cloneElement, isValidElement, useId } from "react";

export default function Field({
  id,
  label,
  error,
  help,
  required,
  children,
  className = "",
}) {
  const generatedId = useId();
  const controlId = id || `${generatedId}-control`;
  const helpId = help && !error ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  const canEnhanceControl =
    isValidElement(children) &&
    children.type !== "div" &&
    children.type !== React.Fragment;
  const control = canEnhanceControl
    ? cloneElement(children, {
        id: children.props.id || controlId,
        "aria-describedby": children.props["aria-describedby"] || describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })
    : children;

  return (
    <div className={["space-y-1.5", className].join(" ")}>
      {label ? (
        <label
          htmlFor={controlId}
          className="block text-sm font-medium text-content-secondary"
        >
          {label}
          {required ? <span className="text-state-error"> *</span> : null}
        </label>
      ) : null}
      {control}
      {help && !error ? (
        <p id={helpId} className="text-xs leading-5 text-content-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs leading-5 text-state-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
