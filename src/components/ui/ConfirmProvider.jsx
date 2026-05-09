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
    [dialog]
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
        maxWidth="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => close(false)}>
              {dialog?.cancelLabel || "Cancel"}
            </Button>
            <Button
              type="button"
              variant={dialog?.tone === "danger" ? "danger" : "primary"}
              onClick={() => close(true)}
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

