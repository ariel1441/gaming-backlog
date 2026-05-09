import React, { useEffect, useState } from "react";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { canTogglePublicProfile } from "../utils/permissions";
import { Badge, Button, Switch } from "./ui";

const PublicToggleCard = () => {
  const { user, isAuthenticated, isGuest, setPublic } = useAuth();
  const [pending, setPending] = useState(false);
  const [statusMsg, setStatusMsg] = useState(""); // ephemeral feedback (copy/share)
  const [statusTone, setStatusTone] = useState("success"); // "success" | "error"

  // Auto-clear status after a short delay
  useEffect(() => {
    if (!statusMsg) return;
    const id = setTimeout(() => setStatusMsg(""), 2200);
    return () => clearTimeout(id);
  }, [statusMsg]);

  if (!canTogglePublicProfile({ user, isAuthenticated, isGuest })) return null;

  const shareUrl = `${window.location.origin}/u/${user.username}`;
  const isPublic = !!user.is_public;

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
      className={`rounded-2xl border border-surface-border bg-surface-card/95 shadow-panel ${
        pending ? "opacity-75" : ""
      }`}
      aria-busy={pending ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-surface-border bg-surface-bg/30 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-content-primary">
              Public profile
            </h3>
            <Badge variant={isPublic ? "success" : "default"}>
              {isPublic ? "Public" : "Private"}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-content-muted">
            Share a read-only view of your backlog.
          </p>
        </div>

        <Switch
          checked={isPublic}
          onChange={save}
          disabled={pending}
          label={isPublic ? "On" : "Off"}
          className="w-full sm:w-auto sm:min-w-44"
        />
      </div>

      <div className="p-5">
        {isPublic ? (
          <div className="space-y-4">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open public link in a new tab"
              className="group flex max-w-full items-center gap-2 rounded-xl border border-surface-border bg-surface-bg/45 px-3 py-2.5 text-sm text-content-secondary transition-colors hover:border-secondary/50 hover:text-content-primary focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{shareUrl}</span>
            </a>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="primary" onClick={share}>
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Share link
              </Button>
              <Button type="button" variant="secondary" onClick={copy}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  window.open(shareUrl, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open
              </Button>
            </div>

            <p className="text-xs leading-5 text-content-muted">
              Visitors can view your backlog but cannot edit or delete games.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-surface-border bg-surface-bg/35 p-4">
            <p className="text-sm leading-6 text-content-muted">
              Your profile is private. Turn this on when you want a shareable
              read-only page.
            </p>
          </div>
        )}

        <div className="mt-3 min-h-5">
          <div
            className={`text-xs ${
              statusTone === "error" ? "text-state-error" : "text-state-success"
            }`}
            role="status"
            aria-live="polite"
          >
            {statusMsg}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PublicToggleCard;
