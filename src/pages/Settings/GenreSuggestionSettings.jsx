import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, RefreshCw, Search, Sparkles } from "lucide-react";
import PersonalGenreSuggestionEditor from "../../components/PersonalGenreSuggestionEditor";
import {
  Button, Checkbox, EmptyState, GameCover, Skeleton, TextInput,
  useConfirm, useToast,
} from "../../components/ui";
import { usePersonalGenres } from "../../hooks/usePersonalGenres";
import { applyGameGenreSuggestions, dismissGameGenreSuggestions, listGameGenreSuggestions } from "../../services/gameService";

const MAX_GENRES_PER_GAME = 10;

function initialSelection(review) {
  return [...new Set([
    ...review.currentPersonalGenres.map((genre) => genre.id),
    ...review.suggestions.map((genre) => genre.id),
  ])].slice(0, MAX_GENRES_PER_GAME);
}

export function GenreSuggestionSettings({ refreshGames }) {
  const [reviews, setReviews] = useState([]);
  const [selected, setSelected] = useState({});
  const [included, setIncluded] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyingGameId, setApplyingGameId] = useState(null);
  const [dismissingGameId, setDismissingGameId] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState({ nextOffset: null, hasMore: false });
  const [onlyWithoutPersonalGenres, setOnlyWithoutPersonalGenres] = useState(false);
  const { genres: availablePersonalGenres } = usePersonalGenres(true);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async ({ quiet = false, append = false, offset = 0 } = {}) => {
    if (append) setLoadingMore(true);
    else if (!quiet) setLoading(true);
    setError(null);
    try {
      const payload = await listGameGenreSuggestions({
        limit: 50,
        offset,
        onlyWithoutPersonalGenres,
      });
      const nextReviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
      const nextSelected = Object.fromEntries(nextReviews.map((review) => [review.game.id, initialSelection(review)]));
      setReviews((current) => append ? [...current, ...nextReviews] : nextReviews);
      setSelected((current) => append ? { ...current, ...nextSelected } : nextSelected);
      const nextIncluded = Object.fromEntries(nextReviews.map((review) => [review.game.id, false]));
      setIncluded((current) => append ? { ...current, ...nextIncluded } : nextIncluded);
      setPage(payload?.page || { nextOffset: null, hasMore: false });
    } catch (nextError) {
      setError(nextError);
    } finally {
      if (append) setLoadingMore(false);
      else if (!quiet) setLoading(false);
    }
  }, [onlyWithoutPersonalGenres]);

  useEffect(() => { load(); }, [load]);

  const visibleReviews = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? reviews.filter((review) => review.game.name.toLocaleLowerCase().includes(needle))
      : reviews;
  }, [query, reviews]);
  const selectedEntries = useMemo(
    () => reviews
      .map((review) => ({ review, ids: selected[review.game.id] || [] }))
      .filter(({ review, ids }) => (
        included[review.game.id] &&
        (ids.length || review.currentPersonalGenres.length)
      )),
    [included, reviews, selected],
  );
  const selectedCount = selectedEntries.reduce((total, entry) => total + entry.ids.length, 0);
  const busy = applying || applyingGameId !== null || dismissingGameId !== null;

  const updateSelection = (gameId, ids) => {
    setSelected((current) => ({ ...current, [gameId]: ids }));
  };

  const toggleVisible = (nextIncluded) => {
    setIncluded((current) => ({
      ...current,
      ...Object.fromEntries(visibleReviews.map((review) => [
        review.game.id,
        nextIncluded && (
          (selected[review.game.id] || []).length > 0 ||
          review.currentPersonalGenres.length > 0
        ),
      ])),
    }));
  };

  const applyOne = async (review) => {
    const ids = selected[review.game.id] || [];
    if ((!ids.length && !review.currentPersonalGenres.length) || busy) return;
    setApplyingGameId(review.game.id);
    try {
      await applyGameGenreSuggestions(
        review.game.id,
        ids,
        review.currentPersonalGenres.map((genre) => genre.id),
      );
      const genreChoices = [...availablePersonalGenres, ...review.suggestions];
      const finalGenres = ids.map((id) => genreChoices.find((genre) => Number(genre.id) === Number(id))).filter(Boolean);
      const remainingSuggestions = review.suggestions.filter((genre) => !ids.includes(genre.id));
      setReviews((current) => current.flatMap((item) => {
        if (item.game.id !== review.game.id) return [item];
        if (!remainingSuggestions.length) return [];
        return [{ ...item, currentPersonalGenres: finalGenres, suggestions: remainingSuggestions }];
      }));
      setSelected((current) => ({ ...current, [review.game.id]: [] }));
      setIncluded((current) => ({ ...current, [review.game.id]: false }));
      await refreshGames?.();
      toast.success(`Genres updated for ${review.game.name}.`);
    } catch (nextError) {
      toast.error(nextError.message || `Could not update ${review.game.name}.`);
    } finally {
      setApplyingGameId(null);
    }
  };

  const applySelected = async () => {
    if (!selectedEntries.length || busy) return;
    const accepted = await confirm({
      title: "Apply genre choices?",
      message: `Save the chosen personal genres for ${selectedEntries.length} selected game${selectedEntries.length === 1 ? "" : "s"}? This can add or remove genres.`,
      confirmLabel: "Apply to selected games",
      tone: "primary",
    });
    if (!accepted) return;

    setApplying(true);
    const results = await Promise.allSettled(selectedEntries.map(({ review, ids }) => applyGameGenreSuggestions(
      review.game.id,
      ids,
      review.currentPersonalGenres.map((genre) => genre.id),
    )));
    const failed = results.filter((result) => result.status === "rejected");
    try {
      await Promise.all([load({ quiet: true }), refreshGames?.()]);
      if (failed.length) {
        toast.error(`${failed.length} game${failed.length === 1 ? "" : "s"} could not be updated. The review list was refreshed.`);
      } else {
        toast.success("Genre choices saved for the selected games.");
      }
    } finally {
      setApplying(false);
    }
  };

  const dismissSuggestion = async (review, genre) => {
    if (busy) return;
    setDismissingGameId(review.game.id);
    try {
      await dismissGameGenreSuggestions(review.game.id, [genre.id]);
      setReviews((current) => current.flatMap((item) => {
        if (item.game.id !== review.game.id) return [item];
        const suggestions = item.suggestions.filter((candidate) => candidate.id !== genre.id);
        if (!suggestions.length) return [];
        return [{ ...item, suggestions }];
      }));
      setSelected((current) => ({
        ...current,
        [review.game.id]: (current[review.game.id] || []).filter((id) => id !== genre.id),
      }));
      setIncluded((current) => ({ ...current, [review.game.id]: false }));
      toast.success(`${genre.name} dismissed for ${review.game.name}.`);
    } catch (nextError) {
      toast.error(nextError.message || `Could not dismiss ${genre.name}.`);
    } finally {
      setDismissingGameId(null);
    }
  };

  return (
    <section className="rounded-panel border border-surface-border bg-surface-card p-4 shadow-panel sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary-light" aria-hidden="true" /> Genre suggestions
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-content-muted">
            Choose the games to update, adjust their final genre selections, then save them together—or apply one game immediately.
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => load()} disabled={loading || busy}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </Button>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-surface-border bg-surface-bg/35 p-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" aria-hidden="true" />
          <TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games in this review" aria-label="Search genre suggestion games" className="pl-9" />
        </div>
        <Checkbox checked={onlyWithoutPersonalGenres} onChange={setOnlyWithoutPersonalGenres} disabled={loading || busy} label="Only uncategorized games" />
      </div>

      {loading ? (
        <div className="mt-5 space-y-3"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      ) : error ? (
        <div className="mt-5 rounded-xl border border-state-error/35 bg-state-error/10 p-4 text-sm text-state-error" role="alert">
          Could not load genre suggestions. <Button type="button" size="sm" variant="ghost" onClick={() => load()}>Try again</Button>
        </div>
      ) : !reviews.length ? (
        <EmptyState className="mt-5" icon={Sparkles} title="No genre suggestions waiting" description="Games with complete metadata are already covered by the current rules, or do not have a confident match." />
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-content-muted">
              {query.trim()
                ? `Showing ${visibleReviews.length} of ${reviews.length} loaded games`
                : reviews.length === 50
                  ? "Showing the first 50 games"
                  : `Showing ${reviews.length} games`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => toggleVisible(true)} disabled={busy}>Select visible</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => toggleVisible(false)} disabled={busy}>Clear visible</Button>
              {selectedEntries.length ? (
                <Button type="button" size="sm" variant="primary" onClick={applySelected} disabled={busy}>
                  <CheckCheck className="h-4 w-4" aria-hidden="true" /> Apply selected ({selectedEntries.length})
                </Button>
              ) : null}
            </div>
          </div>
          {visibleReviews.length ? (
            <div className="mt-3 space-y-3">
              {visibleReviews.map((review) => {
                const ids = selected[review.game.id] || [];
                const isIncluded = Boolean(included[review.game.id]);
                const isApplying = applyingGameId === review.game.id;
                return (
                  <article key={review.game.id} className={["overflow-hidden rounded-card border transition-colors", isIncluded ? "border-primary/55 bg-surface-selected/35 shadow-sm shadow-primary/10" : "border-surface-border bg-surface-bg/35 hover:border-surface-border-strong"].join(" ")}>
                    <div className="grid min-h-32 grid-cols-[2.75rem_4.5rem_minmax(0,1fr)] items-stretch sm:min-h-36 sm:grid-cols-[3.25rem_6rem_minmax(0,1fr)]">
                      <div className="flex items-center justify-center">
                        <Checkbox checked={isIncluded} onChange={(checked) => setIncluded((current) => ({ ...current, [review.game.id]: checked }))} disabled={busy || (!ids.length && !review.currentPersonalGenres.length)} ariaLabel={`${isIncluded ? "Exclude" : "Include"} ${review.game.name} in batch apply`} className="[&>span:first-of-type]:h-5 [&>span:first-of-type]:w-5 [&>span:first-of-type_svg]:h-3.5 [&>span:first-of-type_svg]:w-3.5" />
                      </div>
                      <GameCover src={review.game.cover} name={review.game.name} fit="contain" backdrop className="h-full min-h-32 w-full border-x border-surface-border sm:min-h-36" />
                      <div className="flex min-w-0 flex-col justify-center px-3 py-3 sm:px-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="min-w-0 break-words font-semibold text-content-primary">{review.game.name}</h3>
                          <Button type="button" size="sm" variant="secondary" aria-label={`Apply genres to ${review.game.name}`} onClick={() => applyOne(review)} disabled={busy || (!ids.length && !review.currentPersonalGenres.length)}>{isApplying ? "Applying..." : "Apply"}</Button>
                        </div>
                        <div className="mt-2.5">
                          <PersonalGenreSuggestionEditor suggestions={review.suggestions} currentPersonalGenres={review.currentPersonalGenres} availablePersonalGenres={availablePersonalGenres} selectedIds={ids} onChange={(nextIds) => updateSelection(review.game.id, nextIds)} onDismissSuggestion={(genre) => dismissSuggestion(review, genre)} disabled={busy} compact />
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState className="mt-4" icon={Search} title="No matching games" description="Try a different search." />
          )}

          {page.hasMore && !query.trim() ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="secondary" onClick={() => load({ append: true, offset: page.nextOffset })} disabled={loadingMore || busy}>
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          ) : null}

          <div className="sticky bottom-20 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-card/95 p-3 shadow-elevated backdrop-blur sm:p-4 lg:bottom-3">
            <div>
              <p className="text-sm font-medium text-content-primary">{selectedEntries.length} game{selectedEntries.length === 1 ? "" : "s"} selected</p>
              <p className="mt-0.5 text-xs text-content-muted">{selectedCount} genre choice{selectedCount === 1 ? "" : "s"} will be saved.</p>
            </div>
            <Button type="button" variant="primary" onClick={applySelected} disabled={!selectedEntries.length || busy}>
              <CheckCheck className="h-4 w-4" aria-hidden="true" /> {applying ? "Applying..." : "Apply to selected games"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
