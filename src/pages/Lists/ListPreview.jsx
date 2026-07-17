import React from "react";
import { GameCover } from "../../components/ui";

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
        const title = gameTitle(game);
        return (
          <CoverSlot
            key={game?.id || title || index}
            game={game}
          />
        );
      })}
    </div>
  );
}

function CoverSlot({ game }) {
  const cover = gameCover(game);
  const title = gameTitle(game);

  return (
    <div className="relative min-h-0 min-w-0 border-surface-border odd:border-r [&:nth-child(-n+2)]:border-b">
      <GameCover
        src={cover}
        name={title}
        className="h-full w-full"
        fallbackClassName="[&>div]:gap-0 [&_svg]:hidden"
      />
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
