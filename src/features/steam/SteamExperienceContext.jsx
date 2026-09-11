import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useGames } from "../../hooks/useGames";
import { getSteamSyncHealth } from "../../services/steamService";
import {
  clearWishlistCache,
  invalidateWishlistCache,
  reconcileWishlistConnection,
} from "../../services/wishlistCache";

const Context = createContext({
  account: null,
  activeJob: null,
  runs: [],
  error: "",
  reload: async () => {},
});
export const useSteamExperience = () => useContext(Context);

export function SteamExperienceProvider({ children }) {
  const { user, isAuthenticated, isGuest } = useAuth();
  const { refresh: refreshGames } = useGames();
  const [state, setState] = useState(null);
  const reloadRef = useRef(async () => {});
  const refreshGamesRef = useRef(refreshGames);
  refreshGamesRef.current = refreshGames;
  const reload = useCallback(() => reloadRef.current(), []);
  useEffect(() => {
    setState(null);
    if (!isAuthenticated || isGuest || !user?.id) {
      reloadRef.current = async () => {};
      return;
    }
    let stopped = false,
      timer,
      inFlight = null,
      previous = null;
    const controller = new AbortController();
    const poll = () => {
      if (stopped || document.visibilityState === "hidden")
        return Promise.resolve();
      if (inFlight) return inFlight;
      clearTimeout(timer);
      inFlight = (async () => {
        let delay = 60_000;
        try {
          const payload = await getSteamSyncHealth({
            signal: controller.signal,
          });
          if (stopped) return;
          const account = payload.account;
          reconcileWishlistConnection(user.id, account?.id);
          if (previous && previous.account?.id !== account?.id)
            clearWishlistCache();
          else if (
            previous &&
            (previous.account?.priceRevision !== account?.priceRevision ||
              previous.account?.lastWishlistSyncAt !==
                account?.lastWishlistSyncAt)
          )
            invalidateWishlistCache();
          if (
            previous &&
            previous.account?.lastLibrarySyncAt !== account?.lastLibrarySyncAt
          )
            void refreshGamesRef.current({ silent: true });
          previous = payload;
          setState({ ...payload, userId: user.id, error: "" });
          if (payload.activeJob) delay = 5_000;
        } catch (error) {
          if (!stopped)
            setState((current) => ({
              ...current,
              userId: user.id,
              error: error.message || "Could not check sync health.",
            }));
        } finally {
          inFlight = null;
          if (!stopped) timer = setTimeout(poll, delay);
        }
      })();
      return inFlight;
    };
    reloadRef.current = poll;
    const wake = () => {
      if (document.visibilityState !== "hidden") void poll();
    };
    void poll();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [user?.id, isAuthenticated, isGuest]);
  const visible =
    isAuthenticated && !isGuest && state?.userId === user?.id ? state : null;
  return (
    <Context.Provider
      value={{
        account: null,
        activeJob: null,
        runs: [],
        error: "",
        ...visible,
        reload,
      }}
    >
      {children}
    </Context.Provider>
  );
}
