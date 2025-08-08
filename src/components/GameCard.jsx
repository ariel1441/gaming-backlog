import React from "react";
import { statusClassMap } from "../utils/statusClassMap";
import { useAuth } from "../contexts/AuthContext";

const GameCard = ({ game, onClick, onEdit, onDelete, isAdmin }) => {
  const { user, isAuthenticated } = useAuth();

  // If game has a user_id, only that user can edit/delete.
  // Otherwise, fall back to legacy isAdmin prop.
  const canEdit =
    typeof game?.user_id === "number"
      ? isAuthenticated && user?.id === game.user_id
      : !!isAdmin;
  const handleCardClick = (e) => {
    if (e.target.closest(".action-button")) return;
    onClick();
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    if (!canEdit) {
      alert("Admin access required to edit games.");
      return;
    }
    onEdit();
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (!canEdit) {
      alert("Admin access required to delete games.");
      return;
    }
    onDelete();
  };

  const getStatusColor = (status) => {
    if (!status || typeof status !== "string")
      return "bg-content-muted/20 text-content-muted border-content-muted/30";
    const normalized = status.toLowerCase().trim().replaceAll("-", " ");
    return (
      statusClassMap[normalized] ||
      "bg-content-muted/20 text-content-muted border-content-muted/30"
    );
  };

  return (
    <div
      className="bg-surface-card/90 backdrop-blur-sm rounded-xl overflow-hidden cursor-pointer hover:bg-surface-elevated/90 transition-all duration-300 relative group border border-surface-border hover:border-primary/40 hover:shadow-glow-primary hover:scale-[1.02]"
      onClick={handleCardClick}
    >
      {canEdit && (
        <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-all duration-300 flex gap-2">
          <button
            onClick={handleEdit}
            className="action-button bg-gradient-to-r from-action-secondary to-action-secondary-hover hover:from-secondary-light hover:to-secondary text-content-primary p-2.5 rounded-full text-xs font-bold shadow-lg hover:shadow-glow-secondary transform hover:scale-110 transition-all duration-200"
            title="Edit game"
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            className="action-button bg-gradient-to-r from-action-danger to-action-danger-hover hover:from-state-error/80 hover:to-state-error text-content-primary p-2.5 rounded-full text-xs font-bold shadow-lg hover:shadow-glow-error transform hover:scale-110 transition-all duration-200"
            title="Delete game"
          >
            🗑️
          </button>
        </div>
      )}

      {game.cover && (
        <div className="relative overflow-hidden">
          <img
            src={game.cover}
            alt={game.name}
            loading="lazy"
            className="w-full h-60 object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-bg/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>
      )}

      <div className="p-4">
        <h3 className="text-lg font-bold mb-3 text-content-primary truncate group-hover:text-primary transition-colors duration-200">
          {game.name}
        </h3>

        <div className="space-y-4">
          {game.status && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-content-secondary uppercase tracking-wider min-w-fit">
                Status
              </span>
              <span
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${getStatusColor(game.status)}`}
              >
                {game.status}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            {game.rating && (
              <div>
                <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-1">
                  Rating
                </div>
                <div className="text-state-warning font-bold text-lg">
                  ⭐ {game.rating}/5
                </div>
              </div>
            )}
            {game.how_long_to_beat && (
              <div>
                <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-1">
                  How Long to Beat
                </div>
                <div className="text-state-success font-semibold">
                  🕒 {game.how_long_to_beat}h
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-surface-border/50">
            {game.my_genre && (
              <div>
                <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-1">
                  My Genre
                </div>
                <div className="text-content-primary text-sm">
                  {game.my_genre}
                </div>
              </div>
            )}
            {game.genres && (
              <div>
                <div className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-1">
                  Genres
                </div>
                <div className="text-content-primary text-sm line-clamp-1">
                  {game.genres}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameCard;
