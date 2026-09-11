import { useCallback, useEffect, useRef, useState } from "react";
import { listPersonalGenres } from "../services/personalGenreService";
import { useAuth } from "../contexts/AuthContext";

export function usePersonalGenres(enabled = true) {
  const { user, getAuthHeaders, isAuthenticated } = useAuth();
  const scope = enabled && isAuthenticated ? user?.id : null;
  const [state, setState] = useState({ scope: null, genres: [], loading: false, error: null });
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const sequence = useRef(0);
  const controller = useRef(null);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    controller.current?.abort();
    if (!scope) return [];
    const abort = new AbortController();
    controller.current = abort;
    const current = () => !abort.signal.aborted && request === sequence.current && currentScope.current === scope;
    setState(value => ({ scope, genres: value.scope === scope ? value.genres : [], loading: true, error: null }));
    try {
      const payload = await listPersonalGenres({ signal: abort.signal, auth: false, headers: getAuthHeaders() });
      const next = Array.isArray(payload?.genres) ? payload.genres : [];
      if (!current()) return [];
      setState({ scope, genres: next, loading: false, error: null });
      return next;
    } catch (nextError) {
      if (!current()) return [];
      setState(value => ({ ...value, loading: false, error: nextError }));
      throw nextError;
    }
  }, [scope, getAuthHeaders]);

  useEffect(() => {
    refresh().catch(() => {});
    return () => { sequence.current++; controller.current?.abort(); };
  }, [refresh]);

  const setGenres = useCallback(genres => setState(value => ({
    scope, loading: false, error: null,
    genres: typeof genres === 'function' ? genres(value.scope === scope ? value.genres : []) : genres,
  })), [scope]);
  const visible = scope && state.scope === scope ? state : { genres: [], loading: Boolean(scope), error: null };
  return { ...visible, refresh, setGenres };
}
