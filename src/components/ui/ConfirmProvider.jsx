import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import Button from "./Button";
import Modal from "./Modal";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setDialog({
        title: "Are you sure?",
        message: "",
        confirmLabel: "Confirm",
        cancelLabel: "Cancel",
        confirmValue: true,
        secondaryLabel: null,
        secondaryValue: null,
        tone: "danger",
        ...options,
        resolve,
      });
    });
  }, []);

  const close = useCallback(
    (result) => {
      if (dialog?.resolve) dialog.resolve(result);
      setDialog(null);
    },
    [dialog],
  );

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={!!dialog}
        title={dialog?.title}
        description={dialog?.message}
        onClose={() => close(false)}
        size="xs"
        footer={
          <>
            <Button type="button" onClick={() => close(false)}>
              {dialog?.cancelLabel || "Cancel"}
            </Button>
            {dialog?.secondaryLabel ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => close(dialog.secondaryValue)}
              >
                {dialog.secondaryLabel}
              </Button>
            ) : null}
            <Button
              type="button"
              variant={dialog?.tone === "danger" ? "danger" : "primary"}
              onClick={() => close(dialog?.confirmValue ?? true)}
            >
              {dialog?.confirmLabel || "Confirm"}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx.confirm;
}
