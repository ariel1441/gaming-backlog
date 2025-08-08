import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const AuthModal = ({ onClose }) => {
  const { login, register } = useAuth();

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = () => {
    setError("");
    setUsername("");
    setPassword("");
    setMode((m) => (m === "login" ? "register" : "login"));
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
      if (mode === "login") {
        const res = await login(username.trim(), password);
        if (!res?.success && res?.error) setError(res.error);
        else onClose();
      } else {
        const res = await register(username.trim(), password);
        if (!res?.success && res?.error) setError(res.error);
        else onClose();
      }
    } catch (err) {
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-modal">
      <div className="bg-surface-card border border-surface-border rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-content-primary">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h2>
          <button
            onClick={handleClose}
            className="text-content-muted hover:text-content-primary transition-colors text-2xl"
            disabled={loading}
            aria-label="Close authentication modal"
            title="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-content-secondary mb-2"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-md text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Your username"
              autoFocus
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-content-secondary mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-md text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="••••••••"
              disabled={loading}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </div>

          {error && (
            <div className="text-state-error text-sm bg-state-error/20 border border-state-error rounded-md p-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-action-primary hover:bg-action-primary-hover disabled:bg-primary-dark disabled:cursor-not-allowed text-content-primary font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {mode === "login" ? "Signing in..." : "Creating account..."}
              </>
            ) : mode === "login" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <div className="mt-4 text-xs text-content-muted flex items-center justify-between">
          <span>
            {mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}
          </span>
          <button
            onClick={switchMode}
            className="text-primary hover:underline font-medium"
            disabled={loading}
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
