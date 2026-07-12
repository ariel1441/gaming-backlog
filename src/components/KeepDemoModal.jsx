import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button, Field, Modal, TextInput } from "./ui";
import { preferredLandingPath } from "../utils/userPreferences";

export default function KeepDemoModal({ open, onClose }) {
  const { keepDemo } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const close = () => {
    if (!loading) onClose?.();
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!username.trim() || !password.trim()) {
      setErr("Username and password are required.");
      return;
    }
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setErr("Password must be at most 72 UTF-8 bytes.");
      return;
    }
    setLoading(true);
    const res = await keepDemo(username.trim(), password);
    setLoading(false);
    if (res?.success) {
      onClose?.();
      navigate(preferredLandingPath(res?.user));
    } else {
      setErr(res?.error || "Could not save demo.");
    }
  };

  return (
    <Modal
      title="Save your demo"
      description="Turn this demo session into your own account without losing the changes you made."
      onClose={close}
      closeDisabled={loading}
      size="sm"
      bodyClassName="p-0"
    >
      <form onSubmit={submit}>
        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-surface-border bg-surface-bg/35 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-primary-light">
                <Save className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-sm leading-6 text-content-muted">
                Your current demo backlog, edits, and ordering will move into
                this account.
              </p>
            </div>
          </div>

          <Field id="keep-demo-username" label="Username">
            <TextInput
              id="keep-demo-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              disabled={loading}
              autoComplete="username"
            />
          </Field>

          <Field id="keep-demo-password" label="Password">
            <TextInput
              id="keep-demo-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              minLength={8}
            />
          </Field>

          {err ? (
            <div className="rounded-xl border border-state-error/50 bg-state-error/10 p-3 text-sm leading-6 text-state-error">
              {err}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-surface-border bg-surface-bg/35 p-4">
          <Button type="button" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
