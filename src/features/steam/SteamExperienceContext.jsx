import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { invalidateGamesCache } from "../../services/gamesCache";
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
  dailyRuns: [],
  error: "",
  reload: async () => {},
});
export const useSteamExperience = () => useContext(Context);

export function SteamExperienceProvider({ children }) {
  const { user, isAuthenticated, isGuest } = useAuth();
  const { pathname } = useLocation();
  const diagnostics = /^\/settings\/?$/.test(pathname);
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;
  const [state, setState] = useState(null);
  const reloadRef = useRef(async () => {});
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
        const detail = diagnosticsRef.current ? "full" : "summary";
        try {
          const payload = await getSteamSyncHealth({
            signal: controller.signal,
            detail,
          });
          if (stopped) return;
          const hasAccountState = Object.prototype.hasOwnProperty.call(
            payload,
            "account",
          );
          const account = payload.account;
          if (hasAccountState) {
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
              invalidateGamesCache(user.id);
          }
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
          if (!stopped) timer = setTimeout(poll,
            detail !== (diagnosticsRef.current ? "full" : "summary") ? 0 : delay);
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
  useEffect(() => {
    // Join any active request; its completion immediately fetches the new detail
    // level if needed. Keep the account/revision baseline across route changes.
    void reload();
  }, [diagnostics, reload]);
  const visible =
    isAuthenticated && !isGuest && state?.userId === user?.id ? state : null;
  return (
    <Context.Provider
      value={{
        account: null,
        activeJob: null,
        runs: [],
        dailyRuns: [],
        error: "",
        ...visible,
        reload,
      }}
    >
      {children}
    </Context.Provider>
  );
}
