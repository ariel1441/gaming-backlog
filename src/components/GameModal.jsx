import React, { useState } from "react";
import {
  CalendarDays,
  Clock3,
  Layers3,
  Sparkles,
  Star,
  Tag,
  Trophy,
  X,
} from "lucide-react";
import { Button, IconButton, StatusBadge } from "./ui";

function fmtDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function DetailStat({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "warning"
      ? "text-state-warning"
      : tone === "success"
        ? "text-state-success"
        : tone === "primary"
          ? "text-primary"
          : tone === "muted"
            ? "text-content-muted"
            : "text-content-primary";

  return (
    <div className="rounded-xl border border-surface-border bg-surface-elevated/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-content-muted">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function DetailSection({ icon: Icon, label, children, className = "" }) {
  return (
    <section
      className={[
        "rounded-2xl border border-surface-border bg-surface-card/70 p-4 md:p-5",
        className,
      ].join(" ")}
    >
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-content-muted">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      {children}
    </section>
  );
}

function SectionContent({ children }) {
  return <div className="space-y-4">{children}</div>;
}

function TimelineRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-elevated/40 px-4 py-3">
      <span className="text-sm text-content-secondary">{label}</span>
      <span className="text-sm font-medium text-content-primary">{value}</span>
    </div>
  );
}

export default function GameModal({ game, onClose, onRefresh }) {
  const [showDescription, setShowDescription] = useState(false);
  if (!game) return null;

  const invalidValues = ["#N/A", "N/A", "null", "", null, undefined];

  const cover =
    game.cover || "https://via.placeholder.com/900x1200?text=No+Cover";
  const status = game.status || "Unknown";
  const myGenre = game.my_genre || null;
  const genres = game.genres || null;
  const thoughts = game.thoughts?.trim() || null;
  const description = game.description || "";
  const releaseDate = fmtDate(game.releaseDate);
  const startedAt = fmtDate(game.started_at);
  const finishedAt = fmtDate(game.finished_at);
  const rating =
    !invalidValues.includes(game.rating) && game.rating != null
      ? `${game.rating}/5`
      : null;
  const myScore =
    !invalidValues.includes(game.my_score) && game.my_score != null
      ? `${game.my_score}/10`
      : null;
  const metacritic =
    !invalidValues.includes(game.metacritic) && game.metacritic != null
      ? String(game.metacritic)
      : null;
  const metricStats = [
    {
      icon: Clock3,
      label: "How long to beat",
      value: game.how_long_to_beat ? `${game.how_long_to_beat}h` : "TBD",
      tone: game.how_long_to_beat ? "success" : "muted",
    },
    {
      icon: Star,
      label: "RAWG rating",
      value: rating || "N/A",
      tone: rating ? "warning" : "muted",
    },
    {
      icon: Trophy,
      label: "Metacritic",
      value: metacritic || "N/A",
      tone: metacritic ? "default" : "muted",
    },
    {
      icon: Trophy,
      label: "My score",
      value: myScore || "Not scored",
      tone: myScore ? "primary" : "muted",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-modal overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-modal-title"
    >
      <div
        className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative w-full overflow-hidden rounded-2xl border border-surface-border bg-surface-bg shadow-glow-primary">
          <IconButton
            icon={X}
            onClick={onClose}
            className="absolute right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-surface-border bg-surface-card/85 text-content-primary transition-colors hover:border-primary hover:text-primary"
            label="Close modal"
            title="Close"
          />

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,40%)_1fr]">
            <div className="relative overflow-hidden border-b border-surface-border bg-surface-bg lg:h-[calc(100vh-3rem)] lg:max-h-[760px] lg:min-h-[620px] lg:self-start lg:border-b-0 lg:border-r">
              <img
                src={cover}
                alt={game.name || "Game cover"}
                className="h-[300px] w-full object-cover sm:h-[380px] lg:h-full"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-bg/70 via-transparent to-surface-bg/10 lg:bg-gradient-to-r lg:from-transparent lg:via-surface-bg/5 lg:to-surface-bg/20" />
            </div>

            <div className="flex flex-col">
              <div className="border-b border-surface-border px-5 pb-5 pt-6 md:px-7 md:pr-20">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2
                      id="game-modal-title"
                      className="break-words pr-10 text-3xl font-semibold leading-tight text-content-primary md:pr-0 md:text-4xl"
                    >
                      {game.name}
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge status={status} />
                      {releaseDate ? (
                        <span className="rounded-full border border-surface-border bg-surface-card/80 px-3 py-1 text-xs text-content-secondary">
                          Released {releaseDate}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {onRefresh ? (
                    <Button
                      type="button"
                      onClick={onRefresh}
                      variant="secondary"
                      className="pr-4"
                    >
                      <Sparkles className="h-4 w-4" />
                      Surprise me again
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-5 p-5 md:p-7">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {metricStats.map((stat) => (
                    <DetailStat
                      key={stat.label}
                      icon={stat.icon}
                      label={stat.label}
                      value={stat.value}
                      tone={stat.tone}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)]">
                  <div className="space-y-5">
                    {(myGenre || genres) && (
                      <DetailSection icon={Tag} label="Genres">
                        <SectionContent>
                          {myGenre ? (
                            <div>
                              <div className="mb-1 text-sm font-medium text-content-secondary">
                                My genre
                              </div>
                              <div className="text-base text-content-primary">
                                {myGenre}
                              </div>
                            </div>
                          ) : null}

                          {genres ? (
                            <div>
                              <div className="mb-1 text-sm font-medium text-content-secondary">
                                RAWG genres
                              </div>
                              <div className="text-base text-content-primary">
                                {genres}
                              </div>
                            </div>
                          ) : null}
                        </SectionContent>
                      </DetailSection>
                    )}

                    {thoughts ? (
                      <DetailSection icon={Sparkles} label="Your thoughts">
                        <p className="whitespace-pre-wrap leading-7 text-content-primary">
                          {thoughts}
                        </p>
                      </DetailSection>
                    ) : null}
                  </div>

                  <div className="space-y-5">
                    {(startedAt || finishedAt || releaseDate) && (
                      <DetailSection icon={CalendarDays} label="Timeline">
                        <div className="space-y-3">
                          {releaseDate ? (
                            <TimelineRow label="Release date" value={releaseDate} />
                          ) : null}
                          {startedAt ? (
                            <TimelineRow label="Started" value={startedAt} />
                          ) : null}
                          {finishedAt ? (
                            <TimelineRow label="Finished" value={finishedAt} />
                          ) : null}
                        </div>
                      </DetailSection>
                    )}
                  </div>

                  {description ? (
                    <DetailSection
                      icon={Layers3}
                      label="About the game"
                      className="xl:col-span-2"
                    >
                      <Button
                        type="button"
                        onClick={() => setShowDescription((prev) => !prev)}
                        variant="primary"
                        aria-expanded={showDescription}
                        aria-controls="game-description"
                      >
                        {showDescription ? "Hide description" : "Show description"}
                      </Button>

                      {showDescription ? (
                        <div
                          id="game-description"
                          className="prose prose-invert mt-4 max-w-3xl rounded-xl border border-surface-border bg-surface-elevated/35 p-5 leading-7 text-content-primary"
                          dangerouslySetInnerHTML={{ __html: description }}
                        />
                      ) : null}
                    </DetailSection>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
