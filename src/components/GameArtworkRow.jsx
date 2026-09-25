import React from "react";
import { GameCover } from "./ui";
import { GAME_ROW_COVER_SIZE } from "./gameRowCoverStyles";

export default function GameArtworkRow({
  cover,
  coverFallbacks,
  name,
  onClick,
  openLabel = `Open details for ${name}`,
  leading,
  trailing,
  actions,
  footer,
  children,
  embedded = false,
  className = "",
  bodyClassName = "",
  coverClassName = GAME_ROW_COVER_SIZE,
}) {
  return (
    <article className={`group relative overflow-hidden ${embedded ? "" : "rounded-2xl border border-surface-border bg-surface-card shadow-sm transition-colors hover:border-primary/35"} ${className}`}>
      {cover ? (
        <>
          <GameCover
            src={cover}
            fallbackSources={coverFallbacks}
            artwork
            name={name}
            className="pointer-events-none absolute inset-0 h-full w-full"
            imageClassName="absolute inset-0 opacity-35"
            fallbackClassName="opacity-35"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-surface-card via-surface-card/95 to-surface-card/75" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-card/70 via-transparent to-transparent" />
        </>
      ) : null}
      {onClick ? (
        <button
          type="button"
          className="absolute inset-0 z-10 rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          onClick={onClick}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={openLabel}
        />
      ) : null}
      {actions}
      <div className={`relative flex min-h-[9rem] min-w-0 items-stretch gap-4 p-3 transition-colors sm:min-h-[11.5rem] sm:gap-5 sm:p-5 ${onClick ? "group-hover:bg-surface-elevated/20" : ""} ${bodyClassName}`}>
        {leading}
        <GameCover
          src={cover}
          fallbackSources={coverFallbacks}
          artwork
          name={name}
          alt={`${name || "Game"} cover`}
          decorative={false}
          className={`relative ${coverClassName} shrink-0 rounded-xl border border-media-border/10 shadow-lg`}
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center">{children}</div>
        {trailing}
      </div>
      {footer ? (
        <div className="relative z-20 border-t border-surface-border/70 bg-surface-card/95 px-4 py-3 sm:px-5">
          {footer}
        </div>
      ) : null}
    </article>
  );
}
