import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

const PublicToggleCard = () => {
  const { user, setPublic } = useAuth();
  const [pending, setPending] = useState(false);
  const [statusMsg, setStatusMsg] = useState(""); // ephemeral feedback (copy/share)
  const [statusTone, setStatusTone] = useState("success"); // "success" | "error"

  if (!user) return null;

  const shareUrl = `${window.location.origin}/u/${user.username}`;
  const isPublic = !!user.is_public;

  // Auto-clear status after a short delay
  useEffect(() => {
    if (!statusMsg) return;
    const id = setTimeout(() => setStatusMsg(""), 2200);
    return () => clearTimeout(id);
  }, [statusMsg]);

  const save = async (next) => {
    if (pending) return;
    setPending(true);
    try {
      await setPublic(next);
      setStatusTone("success");
      setStatusMsg(next ? "Public mode enabled." : "Public mode disabled.");
    } catch (e) {
      setStatusTone("error");
      setStatusMsg(e?.message || "Failed to update public mode.");
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatusTone("success");
      setStatusMsg("Link copied to clipboard.");
    } catch {
      setStatusTone("error");
      setStatusMsg("Could not copy the link.");
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${user.username}'s Game Backlog`,
          text: "Check out my backlog:",
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; // user canceled
      }
    }
    await copy(); // fallback
  };

  return (
    <section
      className={`rounded-2xl border border-surface-border bg-surface-card p-4 shadow-sm ${
        pending ? "opacity-75" : ""
      }`}
      aria-busy={pending ? "true" : "false"}
    >
      {/* Top row: description + switch (no inner heading) */}
      <div className="flex items-start justify-between gap-4">
        <p className="mt-0.5 text-sm text-content-muted">
          Share a read-only view of your backlog.
        </p>

        {/* Switch */}
        <label
          className={`inline-flex select-none items-center gap-2 ${
            pending ? "pointer-events-none" : ""
          }`}
        >
          <span className="text-sm text-content-secondary">
            {isPublic ? "On" : "Off"}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={isPublic}
            onChange={(e) => save(e.target.checked)}
            disabled={pending}
            aria-label="Toggle public profile"
          />
          <span
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isPublic ? "bg-primary" : "bg-surface-elevated"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-content-primary transition-transform ${
                isPublic ? "translate-x-5" : ""
              }`}
            />
          </span>
        </label>
      </div>

      {/* Body (only when public) */}
      {isPublic && (
        <div className="mt-4 space-y-3">
          {/* Link chip + copy */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open public link in a new tab"
              className="group inline-flex max-w-full items-center gap-2 truncate rounded-lg bg-surface-elevated px-3 py-1.5 text-sm text-content-secondary ring-1 ring-surface-border transition hover:underline focus:outline-none focus:ring-2 focus:ring-action-secondary"
            >
              {/* external link icon */}
              <svg
                className="h-4 w-4 shrink-0 opacity-80 group-hover:opacity-100"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h6v2H7v10h10v-4h2v6H5V5Z" />
              </svg>
              <span className="truncate">{shareUrl}</span>
            </a>

            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-content-secondary ring-1 ring-surface-border transition hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-action-secondary"
              aria-label="Copy link to clipboard"
              title="Copy link"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1Zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z" />
              </svg>
              <span className="sr-only sm:not-sr-only sm:inline">Copy</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={share}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-action-primary px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-secondary"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.23 3.23 0 0 0 0-1.39l7.02-4.11A2.99 2.99 0 1 0 15 5a3 3 0 0 0 .04.49L8.02 9.6A3 3 0 1 0 9 15a3 3 0 0 0-.04-.49l7.02 4.11c.05.12.02.27.02.38A3 3 0 1 0 18 16.08Z" />
              </svg>
              Share link
            </button>

            <button
              type="button"
              onClick={() =>
                window.open(shareUrl, "_blank", "noopener,noreferrer")
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-action-secondary px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-action-secondary-hover focus:outline-none focus:ring-2 focus:ring-action-secondary"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h6v2H7v10h10v-4h2v6H5V5Z" />
              </svg>
              Open link
            </button>
          </div>

          {/* Note */}
          <p className="text-xs text-content-muted">
            Visitors can view your backlog but cannot edit or delete games.
          </p>

          {/* Inline status (ARIA live) */}
          <div
            className={`text-xs ${
              statusTone === "error" ? "text-state.error" : "text-state.success"
            }`}
            role="status"
            aria-live="polite"
          >
            {statusMsg}
          </div>
        </div>
      )}
    </section>
  );
};

export default PublicToggleCard;
