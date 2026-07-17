import React, { useEffect, useMemo, useState } from "react";
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
  const normalizedSrc = typeof src === "string" ? src.trim() : "";
  const [failedSrc, setFailedSrc] = useState("");
  const initials = useMemo(() => initialsFor(name), [name]);
  const failed = !normalizedSrc || failedSrc === normalizedSrc;

  useEffect(() => {
    setFailedSrc("");
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
          src={normalizedSrc}
          alt={decorative ? "" : alt || name || ""}
          loading={loading}
          decoding="async"
          onError={() => setFailedSrc(normalizedSrc)}
          className={[
            "h-full w-full",
            fit === "contain" ? "object-contain" : "object-cover",
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
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-surface-border bg-surface-bg/65 text-base font-semibold text-content-secondary shadow-control-inset">
              {initials || (
                <Gamepad2 className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            {showFallbackLabel ? (
              <span className="line-clamp-2 text-xs font-medium text-content-muted">
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
