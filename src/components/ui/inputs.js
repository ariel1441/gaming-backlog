const baseInputClass =
  "w-full min-h-10 rounded-control border border-surface-border bg-surface-input/80 px-3 py-2 text-sm text-content-primary shadow-inner shadow-overlay/10 placeholder-content-muted transition-colors hover:border-surface-border/80 focus:border-focus/70 focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:cursor-not-allowed disabled:opacity-70";

export function TextInput({ className = "", ...props }) {
  return <input {...props} className={[baseInputClass, className].join(" ")} />;
}

export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      {...props}
      className={[baseInputClass, "min-h-[104px] resize-y", className].join(
        " ",
      )}
    />
  );
}

export function Select({ className = "", children, ...props }) {
  return (
    <select {...props} className={[baseInputClass, className].join(" ")}>
      {children}
    </select>
  );
}
