// src/components/OnboardingModal.jsx
import React from "react";
import { useAuth } from "../contexts/AuthContext";

const ONBOARDING_KEY = "seen_onboarding_v1";

export default function OnboardingModal({ open, onClose, onShowAuth }) {
  const { startDemo } = useAuth();

  if (!open) return null;

  const handleTryDemo = async () => {
    const res = await startDemo();
    if (res?.success) {
      try {
        localStorage.setItem(ONBOARDING_KEY, "1");
      } catch {}
      onClose?.();
    } else if (res?.error) {
      alert(res.error);
    }
  };

  const handleCreate = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {}
    onShowAuth?.(); // open your existing AdminLoginForm
    onClose?.();
  };

  const handleClose = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {}
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-modal">
      <div className="bg-surface-card border border-surface-border rounded-lg p-6 w-full max-w-lg mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-content-primary">
            Welcome to Gaming Backlog
          </h2>
          <button
            onClick={handleClose}
            className="text-content-muted hover:text-content-primary transition-colors text-2xl"
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>

        <p className="text-content-secondary mb-5">
          Want to see the full experience with real data? You can try a{" "}
          <strong>fully interactive demo</strong>—add/edit games, drag to
          reorder, and view insights. Keep your changes as your own account, or
          discard them.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleTryDemo}
            className="inline-flex items-center justify-center rounded-lg bg-action-primary px-4 py-2 text-sm font-medium text-white hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-secondary"
          >
            Try the full demo
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center justify-center rounded-lg bg-surface-default border border-surface-border px-4 py-2 text-sm font-medium hover:bg-surface-muted focus:outline-none"
          >
            Create an account
          </button>
        </div>

        <p className="text-xs text-content-muted mt-4">
          No credit card. The demo is isolated—your changes won't affect anyone
          else.
        </p>
      </div>
    </div>
  );
}
