import React from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Edit3,
  GripVertical,
  PlayCircle,
  UserPlus,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button, Modal, useToast } from "./ui";
import { preferredLandingPath } from "../utils/userPreferences";

const ONBOARDING_KEY = "seen_onboarding_v1";

export default function OnboardingModal({ open, onClose, onShowAuth }) {
  const { startDemo } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  if (!open) return null;

  const markSeen = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {}
  };

  const handleTryDemo = async () => {
    const res = await startDemo();
    if (res?.success) {
      markSeen();
      onClose?.();
      navigate(preferredLandingPath(res?.user));
    } else if (res?.error) {
      toast.error(res.error);
    }
  };

  const handleCreate = () => {
    markSeen();
    onShowAuth?.();
    onClose?.();
  };

  const handleClose = () => {
    markSeen();
    onClose?.();
  };

  return (
    <Modal
      title="Welcome to Gaming Backlog"
      description="Try the app with a ready-made backlog, or create your own account."
      onClose={handleClose}
      size="lg"
      bodyClassName="p-0"
    >
      <div className="space-y-5 p-5">
        <div className="rounded-2xl border border-surface-border bg-surface-bg/35 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Feature icon={Edit3} label="Edit games" />
            <Feature icon={GripVertical} label="Reorder backlog" />
            <Feature icon={BarChart3} label="View insights" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleTryDemo}
            className="rounded-2xl border border-primary/45 bg-primary/10 p-4 text-left transition-colors hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary/60"
          >
            <PlayCircle className="h-5 w-5 text-primary-light" />
            <div className="mt-3 text-sm font-semibold text-content-primary">
              Try the full demo
            </div>
            <p className="mt-1 text-sm leading-6 text-content-muted">
              Explore a filled backlog with safe, isolated demo data.
            </p>
          </button>

          <button
            type="button"
            onClick={handleCreate}
            className="rounded-2xl border border-surface-border bg-surface-bg/35 p-4 text-left transition-colors hover:border-secondary/50 hover:bg-surface-elevated/50 focus:outline-none focus:ring-2 focus:ring-secondary/30"
          >
            <UserPlus className="h-5 w-5 text-secondary-light" />
            <div className="mt-3 text-sm font-semibold text-content-primary">
              Create an account
            </div>
            <p className="mt-1 text-sm leading-6 text-content-muted">
              Start clean and build your own backlog from scratch.
            </p>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-bg/35 px-4 py-3">
          <p className="text-xs leading-5 text-content-muted">
            No credit card. Demo changes are isolated and can be saved later.
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
            Skip for now
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Feature({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-elevated/45 px-3 py-2 text-sm text-content-secondary">
      <Icon className="h-4 w-4 text-content-muted" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
