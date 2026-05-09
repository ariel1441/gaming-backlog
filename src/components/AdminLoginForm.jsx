import React, { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button, Field, Modal, TextInput } from "./ui";

const AuthModal = ({ onClose }) => {
  const { login, register } = useAuth();

  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = () => {
    setError("");
    setUsername("");
    setPassword("");
    setMode((current) => (current === "login" ? "register" : "login"));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }

    setLoading(true);
    try {
      const res =
        mode === "login"
          ? await login(username.trim(), password)
          : await register(username.trim(), password);

      if (!res?.success && res?.error) setError(res.error);
      else onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setUsername("");
    setPassword("");
    setError("");
    onClose();
  };

  return (
    <Modal
      title={mode === "login" ? "Sign in" : "Create your account"}
      description={
        mode === "login"
          ? "Pick up your backlog where you left off."
          : "Save your backlog, demo changes, and public profile settings."
      }
      onClose={handleClose}
      closeDisabled={loading}
      maxWidth="max-w-md"
      bodyClassName="p-0"
    >
      <div className="p-5">
        <div className="mb-5 grid grid-cols-2 rounded-xl border border-surface-border bg-surface-bg/35 p-1">
          <button
            type="button"
            onClick={() => {
              setError("");
              setMode("login");
            }}
            disabled={loading}
            className={[
              "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
              mode === "login"
                ? "bg-surface-elevated text-content-primary shadow-sm"
                : "text-content-muted hover:text-content-primary",
            ].join(" ")}
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setMode("register");
            }}
            disabled={loading}
            className={[
              "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
              mode === "register"
                ? "bg-surface-elevated text-content-primary shadow-sm"
                : "text-content-muted hover:text-content-primary",
            ].join(" ")}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Create
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field id="username" label="Username">
            <TextInput
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              autoFocus
              disabled={loading}
              autoComplete="username"
            />
          </Field>

          <Field id="password" label="Password">
            <TextInput
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              disabled={loading}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </Field>

          {error ? (
            <div className="rounded-xl border border-state-error/50 bg-state-error/10 p-3 text-sm leading-6 text-state-error">
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            className="w-full"
          >
            {loading
              ? mode === "login"
                ? "Signing in..."
                : "Creating account..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-surface-border bg-surface-bg/35 px-3 py-2 text-xs text-content-muted">
          <span>
            {mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}
          </span>
          <button
            type="button"
            onClick={switchMode}
            className="font-medium text-primary hover:underline"
            disabled={loading}
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AuthModal;
