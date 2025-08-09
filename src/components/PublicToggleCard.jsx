import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

const PublicToggleCard = () => {
  const { user, setPublic } = useAuth();
  const [pending, setPending] = useState(false);

  if (!user) return null;

  const shareUrl = `${window.location.origin}/u/${user.username}`;
  const isPublic = !!user.is_public;

  const save = async (next) => {
    if (pending) return;
    setPending(true);
    try {
      await setPublic(next); // optimistic + rollback handled in context
    } catch (e) {
      alert(e.message || "Failed to update public mode");
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Public link copied to clipboard!");
    } catch {
      alert("Could not copy link");
    }
  };

  return (
    <div className="mb-6 p-4 bg-surface-card border border-surface-border rounded-xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Public Mode</div>
          <div className="text-sm text-content-muted">
            Share a read-only view of your backlog.
          </div>
        </div>

        {/* simple switch */}
        <label
          className={`inline-flex items-center gap-2 select-none ${pending ? "opacity-60 pointer-events-none" : ""}`}
        >
          <span className="text-sm">{isPublic ? "On" : "Off"}</span>
          <input
            type="checkbox"
            className="sr-only"
            checked={isPublic}
            onChange={(e) => save(e.target.checked)}
            disabled={pending}
          />
          <div className="w-10 h-6 rounded-full bg-surface-elevated relative">
            <div
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${
                isPublic ? "translate-x-4 bg-primary" : "bg-content-muted"
              }`}
            />
          </div>
        </label>
      </div>

      {isPublic && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <code className="px-2 py-1 rounded bg-surface-elevated text-sm">
            {shareUrl}
          </code>
          <button
            className="px-3 py-1 rounded bg-action-secondary hover:bg-action-secondary-hover text-sm"
            onClick={copy}
          >
            Copy link
          </button>
        </div>
      )}
    </div>
  );
};

export default PublicToggleCard;
