// src/components/KeepDemoModal.jsx
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function KeepDemoModal({ open, onClose }) {
  const { keepDemo } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!username.trim() || !password.trim()) {
      setErr("Username and password are required.");
      return;
    }
    setLoading(true);
    const res = await keepDemo(username.trim(), password);
    setLoading(false);
    if (res?.success) onClose?.();
    else setErr(res?.error || "Could not save demo.");
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-modal">
      <div className="bg-surface-card border border-surface-border rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-content-primary">
            Save your demo
          </h2>
          <button
            onClick={() => !loading && onClose?.()}
            className="text-content-muted hover:text-content-primary transition-colors text-2xl"
            disabled={loading}
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-2">
              Username
            </label>
            <input
              className="w-full rounded border border-surface-border bg-surface-elevated px-3 py-2 text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-2">
              Password
            </label>
            <input
              type="password"
              className="w-full rounded border border-surface-border bg-surface-elevated px-3 py-2 text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {err ? <p className="text-sm text-state.error">{err}</p> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => !loading && onClose?.()}
              className="px-3 py-2 rounded border border-surface-border"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-action-primary text-white hover:bg-action-primary-hover"
              disabled={loading}
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
