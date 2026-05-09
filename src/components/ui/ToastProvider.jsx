import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";

const ToastContext = createContext(null);

const toneClasses = {
  info: "border-primary/40 bg-surface-card text-content-primary",
  success: "border-state-success/40 bg-surface-card text-content-primary",
  warning: "border-state-warning/40 bg-surface-card text-content-primary",
  error: "border-state-error/40 bg-surface-card text-content-primary",
};

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: XCircle,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    ({ title, message, tone = "info", duration = 4500 }) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      setToasts((current) => [
        ...current,
        { id, title, message, tone, duration },
      ]);

      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }

      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      notify,
      dismiss,
      info: (message, options = {}) =>
        notify({ ...options, message, tone: "info" }),
      success: (message, options = {}) =>
        notify({ ...options, message, tone: "success" }),
      warning: (message, options = {}) =>
        notify({ ...options, message, tone: "warning" }),
      error: (message, options = {}) =>
        notify({ ...options, message, tone: "error" }),
    }),
    [dismiss, notify]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed right-4 top-4 z-tooltip flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.tone] || Info;
          return (
            <div
              key={toast.id}
              className={[
                "rounded-lg border p-4 shadow-xl backdrop-blur-sm",
                toneClasses[toast.tone] || toneClasses.info,
              ].join(" ")}
            >
              <div className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  {toast.title ? (
                    <div className="font-semibold text-content-primary">
                      {toast.title}
                    </div>
                  ) : null}
                  {toast.message ? (
                    <div className="text-sm text-content-secondary">
                      {toast.message}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="rounded p-1 text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary"
                  aria-label="Dismiss notification"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

