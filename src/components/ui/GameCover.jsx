import React, { useEffect, useMemo, useState } from "react";
import { resolveGameArtwork } from "../../utils/gameArtwork.js";
import { Gamepad2, ImageOff } from "lucide-react";

const variantClasses = {
  poster: "aspect-[2/3]",
  thumbnail: "aspect-[2/3]",
  hero: "aspect-video",
  steam: "aspect-[184/69]",
  custom: "",
};

function initialsFor(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "";
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

export default function GameCover({
  src,
  fallbackSources = [],
  artwork = false,
  name,
  alt = "",
  variant = "custom",
  fit = "cover",
  loading = "lazy",
  className = "",
  imageClassName = "",
  fallbackClassName = "",
  showFallbackLabel = false,
  fallbackLabel = "Cover unavailable",
  decorative = alt === "",
  ...props
}) {
  const resolved = artwork ? resolveGameArtwork(src) : {};
  const normalizedSrc = resolved.cover || (typeof src === "string" ? src.trim() : "");
  const sources = [normalizedSrc, ...(resolved.coverFallbacks || fallbackSources)].filter((value) => typeof value === "string" && value.trim());
  const [failedSources, setFailedSources] = useState([]);
  const activeSrc = sources.find((value) => !failedSources.includes(value));
  const contain = fit === "contain";
  const initials = useMemo(() => initialsFor(name), [name]);
  const failed = !activeSrc;

  useEffect(() => {
    setFailedSources([]);
  }, [normalizedSrc]);

  return (
    <div
      {...props}
      className={[
        "min-w-0 overflow-hidden bg-surface-elevated",
        variantClasses[variant] || variantClasses.custom,
        className,
      ].join(" ")}
      role={!decorative && failed ? "img" : undefined}
      aria-label={!decorative && failed ? alt || name : undefined}
      aria-hidden={decorative ? "true" : undefined}
    >
      {!failed ? (
        <img
          src={activeSrc}
          alt={decorative ? "" : alt || name || ""}
          loading={loading}
          decoding="async"
          onError={() => setFailedSources((previous) => [...previous, activeSrc])}
          className={[
            "h-full w-full",
            contain ? "object-contain" : "object-cover",
            imageClassName,
          ].join(" ")}
        />
      ) : (
        <div
          className={[
            "media-placeholder-pattern flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-elevated via-surface-card to-surface-bg p-2 text-content-muted",
            fallbackClassName,
          ].join(" ")}
        >
          <div className="flex min-w-0 flex-col items-center justify-center gap-2 text-center">
            <span className={`flex items-center justify-center rounded-xl border border-surface-border bg-surface-bg/65 font-semibold text-content-secondary shadow-control-inset ${showFallbackLabel ? "h-14 w-14 text-xl" : "h-10 w-10 text-base"}`}>
              {initials || (
                <Gamepad2 className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            {showFallbackLabel ? (
              <span className="line-clamp-2 text-sm font-medium text-content-muted">
                {fallbackLabel}
              </span>
            ) : (
              <ImageOff
                className="h-4 w-4 text-content-muted/60"
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
