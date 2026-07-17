import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquareText, SearchX, Sparkles, X } from "lucide-react";
import GameModal from "../components/GameModal";
import {
  AppPage,
  PageHeader,
  PageError,
  PageSection,
} from "../components/layout";
import { Button, EmptyState, useToast } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useStatusGroups } from "../contexts/StatusGroupsContext";
import { useGames } from "../hooks/useGames";
import { apiErrorMessage, buildEditGamePayload } from "./Backlog/backlogForm";
import {
  filterReviewGames,
  hasRealScore,
  hasReview,
  reviewText,
} from "../utils/reviews";
import {
  ReviewCard,
  ReviewsControls,
  ReviewsHeader,
  ReviewsSkeleton,
  ThoughtsEditModal,
} from "./Reviews/ReviewsView";

export default function ReviewsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { games, loading, error, refresh, editGame } = useGames();
  const { statusGroupOf } = useStatusGroups();
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedGame, setSelectedGame] = useState(null);
  const [editingGame, setEditingGame] = useState(null);
  const [thoughtsDraft, setThoughtsDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editFormError, setEditFormError] = useState(null);
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [sortKey, setSortKey] = useState("");
  const [isReversed, setIsReversed] = useState(false);

  const isCompleted = React.useCallback(
    (game) => statusGroupOf(game?.status) === "done",
    [statusGroupOf],
  );

  const reviewedGames = useMemo(() => games.filter(hasReview), [games]);

  const visibleReviews = useMemo(
    () =>
      filterReviewGames({
        games,
        search,
        reviewFilter,
        sortKey,
        isReversed,
        isDone: isCompleted,
      }),
    [games, search, reviewFilter, sortKey, isReversed, isCompleted],
  );

  const summary = useMemo(() => {
    const total = reviewedGames.length;
    const completed = reviewedGames.filter(isCompleted).length;
    const scores = reviewedGames
      .map((game) => game.my_score)
      .filter(hasRealScore)
      .map(Number);
    const averageScore = scores.length
      ? (scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(
          1,
        )
      : "--";
    return {
      total,
      completed,
      notCompleted: total - completed,
      averageScore,
    };
  }, [isCompleted, reviewedGames]);

  const hasActiveFilters = Boolean(
    search.trim() || reviewFilter !== "all" || sortKey || isReversed,
  );

  const clearFilters = () => {
    setSearch("");
    setReviewFilter("all");
    setSortKey("");
    setIsReversed(false);
  };

  const startEditingReview = (game) => {
    setSelectedGame(null);
    setEditFormError(null);
    setEditingGame(game);
    setThoughtsDraft(reviewText(game));
  };

  const handleEditThoughts = async (event) => {
    event.preventDefault();
    if (isEditing) return;
    const original = editingGame || {};
    const result = buildEditGamePayload(
      { ...original, thoughts: thoughtsDraft },
      original,
    );
    if (!result.ok) {
      setEditFormError({
        message: result.message,
        fields: result.fields || {},
      });
      toast.warning(result.message);
      return;
    }

    try {
      setIsEditing(true);
      setEditFormError(null);
      await editGame(original.id, result.payload);
      setEditingGame(null);
      setThoughtsDraft("");
      toast.success("Review updated.");
    } catch (err) {
      const message = apiErrorMessage(
        err,
        "Failed to update review. Please check your inputs and try again.",
      );
      setEditFormError({ message, fields: {} });
      toast.error(message);
    } finally {
      setIsEditing(false);
    }
  };

  const closeThoughtsEditor = () => {
    if (isEditing) return;
    setEditingGame(null);
    setThoughtsDraft("");
    setEditFormError(null);
  };

  if (authLoading || loading) return <ReviewsSkeleton />;

  if (!isAuthenticated) {
    return (
      <AppPage width="wide">
        <PageHeader
          title="Reviews"
          description="Games where you wrote thoughts, notes, or a personal review."
          icon={MessageSquareText}
        />
        <div className="pt-6">
          <EmptyState
            icon={MessageSquareText}
            title="Sign in to view your reviews."
            description="Reviews are built from the thoughts you saved on your backlog games."
            action={
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate("/")}
              >
                Back to backlog
              </Button>
            }
          />
        </div>
      </AppPage>
    );
  }

  if (error) {
    return (
      <AppPage width="wide">
        <PageHeader
          title="Reviews"
          description="Games where you wrote thoughts, notes, or a personal review."
          icon={MessageSquareText}
        />
        <div className="pt-6">
          <PageError
            title="Could not load your reviews."
            description={String(error?.message || error)}
            onRetry={() => refresh()}
          />
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage width="wide">
      <div className="space-y-5">
        <ReviewsHeader summary={summary} />

        <ReviewsControls
          search={search}
          setSearch={setSearch}
          reviewFilter={reviewFilter}
          setReviewFilter={setReviewFilter}
          sortKey={sortKey}
          setSortKey={setSortKey}
          isReversed={isReversed}
          setIsReversed={setIsReversed}
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          visibleCount={visibleReviews.length}
          totalCount={reviewedGames.length}
        />

        <PageSection>
          {visibleReviews.length ? (
            <div className="grid gap-5 xl:grid-cols-2">
              {visibleReviews.map((game) => (
                <ReviewCard
                  key={game.id || game.name}
                  game={game}
                  onOpen={setSelectedGame}
                  onEdit={startEditingReview}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={reviewedGames.length ? SearchX : Sparkles}
              title={
                reviewedGames.length
                  ? "No reviews match those filters."
                  : "No reviews yet."
              }
              description={
                reviewedGames.length
                  ? "Try clearing your search or completion filter."
                  : "Write thoughts on a game and it will appear here as a review card."
              }
              action={
                reviewedGames.length ? (
                  <Button
                    type="button"
                    variant="dangerGhost"
                    onClick={clearFilters}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Clear filters
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => navigate("/")}
                  >
                    Back to backlog
                  </Button>
                )
              }
            />
          )}
        </PageSection>
      </div>

      <GameModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onGameRefresh={() => refresh({ silent: true })}
        readOnly
      />

      <ThoughtsEditModal
        game={editingGame}
        value={thoughtsDraft}
        onChange={(value) => {
          setThoughtsDraft(value);
          setEditFormError(null);
        }}
        onClose={closeThoughtsEditor}
        onSubmit={handleEditThoughts}
        error={editFormError}
        isSubmitting={isEditing}
      />
    </AppPage>
  );
}
