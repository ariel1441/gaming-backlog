import React from "react";
import { Gamepad2 } from "lucide-react";

function gameCover(game) {
  return game?.cover || game?.cover_url || game?.catalog_cover_url || game?.rawg_cover || "";
}

function gameTitle(game) {
  return game?.displayName || game?.name || "";
}

export function CoverCollage({ games = [], className = "" }) {
  const slots = Array.from({ length: 4 }, (_, index) => games[index] || null);
  return (
    <div
      className={[
        "grid aspect-[4/3] grid-cols-2 grid-rows-2 overflow-hidden rounded-lg border border-surface-border bg-surface-elevated",
        className,
      ].join(" ")}
    >
      {slots.map((game, index) => {
        const cover = gameCover(game);
        const title = gameTitle(game);
        return (
          <div
            key={game?.id || title || index}
            className="relative min-h-0 min-w-0 border-surface-border odd:border-r [&:nth-child(-n+2)]:border-b"
          >
            {cover ? (
              <img
                src={cover}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-surface-bg text-content-muted">
                {title ? (
                  <span className="text-lg font-semibold">
                    {String(title).charAt(0)}
                  </span>
                ) : (
                  <Gamepad2 className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function formatUpdatedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
