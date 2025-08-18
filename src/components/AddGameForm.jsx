import React, { useEffect, useState, useCallback, useRef } from "react";

const AddGameForm = ({
  addFormRef,
  newGame,
  setNewGame,
  handleAddGame,
  allStatuses = [],
  allMyGenres = [],
  onClose, // optional; parent can pass to sync state
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const modalRef = useRef(null);

  const doClose = useCallback(() => {
    if (typeof onClose === "function") {
      onClose();
    }
    setIsOpen(false);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        doClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doClose]);

  // Backdrop click — same style as GameModal
  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      doClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onMouseDown={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40"></div>

      {/* Modal card */}
      <div
        ref={(el) => {
          modalRef.current = el;
          if (typeof addFormRef === "function") addFormRef(el);
          else if (addFormRef) addFormRef.current = el;
        }}
        className="relative z-10 w-full max-w-2xl mx-4 rounded-xl border border-surface-border bg-surface-card shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold">Add New Game</h2>
          <button
            type="button"
            onClick={doClose}
            className="text-content-muted hover:text-content-primary"
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleAddGame} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={newGame.name}
              onChange={(e) =>
                setNewGame((g) => ({ ...g, name: e.target.value }))
              }
              placeholder="e.g., Elden Ring"
              className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              required
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={newGame.status}
              onChange={(e) =>
                setNewGame((g) => ({ ...g, status: e.target.value }))
              }
              className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-content-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              required
            >
              <option value="" disabled>
                Select status
              </option>
              {allStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* How Long to Beat */}
          <div>
            <label className="block text-sm font-medium mb-1">
              How Long to Beat (hours)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={newGame.how_long_to_beat}
              onChange={(e) =>
                setNewGame((g) => ({
                  ...g,
                  how_long_to_beat: e.target.value,
                }))
              }
              placeholder="e.g., 40"
              className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* My Genre */}
          <div>
            <label className="block text-sm font-medium mb-1">
              My Genre (comma separated)
            </label>
            <input
              type="text"
              value={newGame.my_genre}
              onChange={(e) =>
                setNewGame((g) => ({ ...g, my_genre: e.target.value }))
              }
              placeholder="e.g., Soulslike, ARPG"
              className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              list="my-genre-suggestions"
            />
            {Array.isArray(allMyGenres) && allMyGenres.length > 0 && (
              <datalist id="my-genre-suggestions">
                {allMyGenres.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            )}
          </div>

          {/* Thoughts */}
          <div>
            <label className="block text-sm font-medium mb-1">Thoughts</label>
            <textarea
              value={newGame.thoughts}
              onChange={(e) =>
                setNewGame((g) => ({ ...g, thoughts: e.target.value }))
              }
              placeholder="Notes, what you expect, why it’s on your backlog..."
              className="w-full min-h-[96px] px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* My Score */}
          <div>
            <label className="block text-sm font-medium mb-1">My Score</label>
            <input
              type="number"
              min="0"
              max="10"
              step="any"
              value={newGame.my_score}
              onChange={(e) =>
                setNewGame((g) => ({ ...g, my_score: e.target.value }))
              }
              placeholder="0–10"
              className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-content-primary placeholder-content-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={doClose}
              className="px-4 py-2 rounded-lg bg-surface-elevated border border-surface-border hover:bg-surface-border text-content-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-action-primary hover:bg-action-primary-hover text-content-primary font-medium transition-colors"
            >
              Add Game
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddGameForm;
