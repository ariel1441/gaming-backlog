// src/components/PublicSettingsModal.jsx
import React from "react";
import PublicToggleCard from "./PublicToggleCard";

const PublicSettingsModal = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-surface-border bg-surface-card shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold">Public Profile</h2>
          <button
            onClick={onClose}
            className="text-content-muted hover:text-content-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          {/* Reuse the exact card we already built */}
          <PublicToggleCard />
        </div>
      </div>
    </div>
  );
};

export default PublicSettingsModal;
