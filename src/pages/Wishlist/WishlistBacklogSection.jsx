import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { Link } from "react-router-dom";
import GameGrid from "../../components/GameGrid";
import { Badge, Button, Skeleton } from "../../components/ui";
import { listAllWishlist } from "../../services/wishlistService";
import WishlistCardFooter from "./WishlistCardFooter";
import { wishlistItemsToGames } from "./wishlistPresentation";

export default function WishlistBacklogSection({ enabled, isAuthenticated, isGuest }) {
  const [state, setState] = useState({ loading: false, items: [], total: 0, error: "" });

  useEffect(() => {
    if (!enabled || !isAuthenticated || isGuest) return undefined;
    let active = true;
    setState((value) => ({ ...value, loading: true, error: "" }));
    listAllWishlist({ active: "active", sort: "priority" })
      .then((payload) => {
        if (active) setState({ loading: false, items: payload.items || [], total: payload.total || 0, error: "" });
      })
      .catch((error) => {
        if (active) setState((value) => ({ ...value, loading: false, error: error.message || "Could not load Wishlist." }));
      });
    return () => { active = false; };
  }, [enabled, isAuthenticated, isGuest]);

  const games = useMemo(() => wishlistItemsToGames(state.items), [state.items]);
  if (!enabled || !isAuthenticated || isGuest) return null;

  return (
    <section className="mt-10 border-t border-surface-border pt-7" aria-labelledby="backlog-wishlist-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="backlog-wishlist-title" className="flex items-center gap-2 text-xl font-semibold">
              <Heart className="h-5 w-5 text-primary-light" aria-hidden="true" />
              Wishlist games
            </h2>
            <Badge variant="primary">{state.total}</Badge>
          </div>
          <p className="mt-1 text-sm text-content-muted">
            Your complete active Wishlist, shown with backlog-style cards but kept out of lifecycle ordering and edits.
          </p>
        </div>
        <Button as={Link} to="/wishlist" variant="secondary" size="sm">Open Wishlist</Button>
      </div>

      {state.loading ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))] sm:[grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-[390px] rounded-2xl" />)}
        </div>
      ) : null}
      {!state.loading && state.error ? (
        <div className="rounded-xl border border-state-error/35 bg-state-error/10 p-4 text-sm text-state-error">{state.error}</div>
      ) : null}
      {!state.loading && !state.error && games.length ? (
        <GameGrid
          games={games}
          viewMode="compact"
          renderCardFooter={(game) => <WishlistCardFooter game={game} preview />}
        />
      ) : null}
      {!state.loading && !state.error && !games.length ? (
        <p className="rounded-xl border border-dashed border-surface-border p-4 text-sm text-content-muted">No active wishlist games to show.</p>
      ) : null}
    </section>
  );
}
