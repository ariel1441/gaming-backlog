import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getAuthToken,
  onUnauthorized,
  setAuthToken,
} from "../services/apiClient";
import * as authService from "../services/authService";
import { clearDiscoverResponseCache } from "../services/discoverCache";
import { normalizeUserWithPreferences } from "../utils/userPreferences";
import { normalizeUserWithProfile } from "../utils/userProfile";

export const AuthContext = createContext(null);

const DEMO_FLAG_KEY = "gb_demo_mode";

function normalizeSessionUser(user) {
  return normalizeUserWithProfile(normalizeUserWithPreferences(user));
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => getAuthToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = useCallback(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const clearSession = useCallback(() => {
    clearDiscoverResponseCache();
    setToken(null);
    setUser(null);
    setAuthToken(null);
    try {
      localStorage.removeItem(DEMO_FLAG_KEY);
    } catch {}
  }, []);

  useEffect(() => onUnauthorized(clearSession), [clearSession]);

  const applySession = useCallback((data, { demo = false } = {}) => {
    if (!data?.token) return false;

    clearDiscoverResponseCache();
    setAuthToken(data.token);
    setToken(data.token);
    setUser(normalizeSessionUser(data.user) || null);

    try {
      if (demo) localStorage.setItem(DEMO_FLAG_KEY, "1");
      else localStorage.removeItem(DEMO_FLAG_KEY);
    } catch {}

    return true;
  }, []);

  const loadUser = useCallback(async () => {
    const me = await authService.me();
    const normalized = normalizeSessionUser(me);
    setUser(normalized);
    return normalized;
  }, []);

  const isGuest = !!user?.is_guest;

  useEffect(() => {
    if (!isGuest) return;

    const id = setInterval(() => {
      authService.heartbeatDemo().catch(() => {});
    }, 60_000);

    return () => clearInterval(id);
  }, [isGuest]);

  useEffect(() => {
    let ignore = false;

    const loadMe = async () => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const me = await authService.me();
        if (!ignore) setUser(normalizeSessionUser(me));
      } catch (err) {
        console.error("Failed to load /me:", err);
        if (!ignore && err?.status !== 0) clearSession();
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadMe();
    return () => {
      ignore = true;
    };
  }, [clearSession, token]);

  const login = useCallback(
    async (username, password) => {
      try {
        const data = await authService.login({ username, password });
        if (!applySession(data)) {
          return { success: false, error: "No token returned from server." };
        }
        const nextUser = data.user
          ? normalizeSessionUser(data.user)
          : await loadUser().catch(() => {
              setUser(null);
              return null;
            });
        return { success: true, user: nextUser };
      } catch (err) {
        console.error("login() failed:", err);
        return {
          success: false,
          error: err?.message || "Network error during login.",
        };
      }
    },
    [applySession, loadUser]
  );

  const register = useCallback(
    async (username, password) => {
      try {
        const data = await authService.register({ username, password });
        if (data?.token) {
          applySession(data);
        }
        const nextUser = data?.user
          ? normalizeSessionUser(data.user)
          : await loadUser().catch(() => {
              setUser(null);
              return null;
            });
        return { success: true, user: nextUser };
      } catch (err) {
        console.error("register() failed:", err);
        return {
          success: false,
          error: err?.message || "Network error during registration.",
        };
      }
    },
    [applySession, loadUser]
  );

  const logout = useCallback(() => {
    authService.logout();
    clearSession();
  }, [clearSession]);

  const startDemo = useCallback(async () => {
    try {
      const data = await authService.startDemo();
      if (!applySession(data, { demo: true })) {
        return { success: false, error: "No token from /demo/start" };
      }
      return {
        success: true,
        user: normalizeSessionUser(data.user),
      };
    } catch (err) {
      console.error("startDemo failed:", err);
      return {
        success: false,
        error: err?.message || "Network error during demo start.",
      };
    }
  }, [applySession]);

  const keepDemo = useCallback(
    async (username, password) => {
      try {
        const data = await authService.keepDemo({ username, password });
        if (!applySession(data)) {
          return { success: false, error: "No token returned from server." };
        }
        return {
          success: true,
          user: normalizeSessionUser(data.user),
        };
      } catch (err) {
        console.error("keepDemo() failed:", err);
        return {
          success: false,
          error: err?.message || "Network error during demo save.",
        };
      }
    },
    [applySession]
  );

  const discardDemo = useCallback(async () => {
    try {
      await authService.discardDemo().catch(() => {});
    } finally {
      clearSession();
    }
    return { success: true };
  }, [clearSession]);

  const refreshMe = useCallback(async () => {
    if (!token) return null;
    try {
      return await loadUser();
    } catch (err) {
      console.error("refreshMe failed:", err);
      return null;
    }
  }, [loadUser, token]);

  const setPublic = useCallback(
    async (nextIsPublic) => {
      if (!user) return null;

      const prev = user;
      setUser({ ...user, is_public: nextIsPublic });

      try {
        const updated = await authService.setPublic(nextIsPublic);
        setUser((current) =>
          current ? normalizeSessionUser({ ...current, ...updated }) : normalizeSessionUser(updated)
        );
        return updated;
      } catch (err) {
        console.error("setPublic failed, rolling back:", err);
        setUser(prev);
        throw err;
      }
    },
    [user]
  );

  const updatePreferences = useCallback(
    async (nextPreferences) => {
      if (!user) return null;

      const prev = user;
      const optimistic = normalizeSessionUser({
        ...user,
        preferences: {
          ...(user.preferences || {}),
          ...(nextPreferences || {}),
        },
      });
      setUser(optimistic);

      try {
        const preferences = await authService.updatePreferences(nextPreferences);
        const updated = normalizeSessionUser({
          ...optimistic,
          preferences,
        });
        setUser(updated);
        return updated.preferences;
      } catch (err) {
        console.error("updatePreferences failed, rolling back:", err);
        setUser(prev);
        throw err;
      }
    },
    [user]
  );

  const updateProfile = useCallback(
    async (nextProfile) => {
      if (!user) return null;

      const prev = user;
      const optimistic = normalizeSessionUser({
        ...user,
        ...(nextProfile || {}),
      });
      setUser(optimistic);

      try {
        const profile = await authService.updateProfile(nextProfile);
        const updated = normalizeSessionUser({
          ...optimistic,
          ...profile,
        });
        setUser(updated);
        return profile;
      } catch (err) {
        console.error("updateProfile failed, rolling back:", err);
        setUser(prev);
        throw err;
      }
    },
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!token,
      isGuest,
      loading,
      getAuthHeaders,
      login,
      register,
      logout,
      startDemo,
      keepDemo,
      discardDemo,
      refreshMe,
      setPublic,
      updatePreferences,
      updateProfile,
    }),
    [
      user,
      token,
      isGuest,
      loading,
      getAuthHeaders,
      login,
      register,
      logout,
      startDemo,
      keepDemo,
      discardDemo,
      refreshMe,
      setPublic,
      updatePreferences,
      updateProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
