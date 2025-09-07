// src/contexts/AuthContext.jsx
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useContext,
} from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const AuthContext = createContext(null);

const TOKEN_KEY = "token";
const DEMO_FLAG_KEY = "gb_demo_mode"; // presence => currently in a demo session

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const isGuest = !!user?.is_guest;
  useEffect(() => {
    if (!isGuest) return;

    let fired = false;

    const discard = () => {
      if (fired) return;
      fired = true;
      try {
        fetch(`${API_BASE}/api/demo/discard`, {
          method: "POST",
          headers: getAuthHeaders(),
          keepalive: true,
        }).catch(() => {});
        // don't clear token here; let the next load call /me and see it's gone
      } catch {}
    };

    // pagehide works well with bfcache
    const onPageHide = () => discard();
    // beforeunload as a conservative fallback
    const onBeforeUnload = () => discard();

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isGuest, getAuthHeaders]);

  // Keep demo alive while tab is open
  useEffect(() => {
    if (!isGuest) return;

    const id = setInterval(() => {
      fetch(`${API_BASE}/api/demo/heartbeat`, {
        method: "POST",
        headers: getAuthHeaders(),
      }).catch(() => {});
    }, 60_000); // every 60s

    return () => clearInterval(id);
  }, [isGuest, getAuthHeaders]);

  // Load /me on boot if token exists
  useEffect(() => {
    let ignore = false;

    const loadMe = async () => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { ...getAuthHeaders() },
        });
        if (!res.ok) throw new Error(`Failed to fetch /me (${res.status})`);
        const me = await res.json();
        if (!ignore) setUser(me);
      } catch (e) {
        console.error("Failed to load /me:", e);
        if (!ignore) {
          // invalid token or network issue → log out
          setUser(null);
          setToken(null);
          try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(DEMO_FLAG_KEY);
          } catch {}
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadMe();
    return () => {
      ignore = true;
    };
  }, [token, getAuthHeaders]);

  /**
   * Perform credential login (used by AdminLoginForm).
   * Returns { success: true } on success, or { success: false, error } on failure.
   */
  const login = useCallback(async (username, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          error: err?.error || `Login failed (${res.status})`,
        };
      }

      const data = await res.json(); // expect { token, user? }
      if (!data?.token) {
        return { success: false, error: "No token returned from server." };
      }

      setToken(data.token);
      try {
        localStorage.setItem(TOKEN_KEY, data.token);
        // leaving a demo session if we were in one
        localStorage.removeItem(DEMO_FLAG_KEY);
      } catch {}

      // Prefer user from response; otherwise load /me
      if (data.user) {
        setUser(data.user);
      } else {
        try {
          const meRes = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${data.token}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            setUser(me);
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
        }
      }

      return { success: true };
    } catch (e) {
      console.error("login() failed:", e);
      return { success: false, error: "Network error during login." };
    }
  }, []);

  /**
   * Perform credential registration (used by AdminLoginForm).
   * Returns { success: true } on success, or { success: false, error } on failure.
   */
  const register = useCallback(async (username, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          error: err?.error || `Registration failed (${res.status})`,
        };
      }

      const data = await res.json(); // could be { token, user } or minimal
      // If your backend returns a token on register, log the user in:
      if (data?.token) {
        setToken(data.token);
        try {
          localStorage.setItem(TOKEN_KEY, data.token);
          // leaving a demo session if we were in one
          localStorage.removeItem(DEMO_FLAG_KEY);
        } catch {}
        if (data.user) setUser(data.user);
        else {
          try {
            const meRes = await fetch(`${API_BASE}/api/auth/me`, {
              headers: { Authorization: `Bearer ${data.token}` },
            });
            if (meRes.ok) {
              const me = await meRes.json();
              setUser(me);
            }
          } catch {}
        }
      }

      return { success: true };
    } catch (e) {
      console.error("register() failed:", e);
      return { success: false, error: "Network error during registration." };
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(DEMO_FLAG_KEY);
    } catch {}
  }, []);

  /**
   * DEMO: start a guest sandbox (no auth required)
   */
  const startDemo = useCallback(async () => {
    try {
      const headers = {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      };
      const res = await fetch(`${API_BASE}/api/demo/start`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          error: err?.error || `Failed to start demo (${res.status})`,
        };
      }
      const data = await res.json(); // { token, user }
      if (!data?.token)
        return { success: false, error: "No token from /demo/start" };

      setToken(data.token);
      try {
        localStorage.setItem(TOKEN_KEY, data.token);
        // Optional: flag for UI fallbacks, but the real source of truth is user.is_guest
        localStorage.setItem(DEMO_FLAG_KEY, "1");
      } catch {}
      setUser(data.user || null);
      return { success: true };
    } catch (e) {
      console.error("startDemo failed:", e);
      return { success: false, error: "Network error during demo start." };
    }
  }, [getAuthHeaders]);

  /**
   * DEMO: convert guest → real account (auth required)
   */
  const keepDemo = useCallback(
    async (username, password) => {
      try {
        const res = await fetch(`${API_BASE}/api/demo/keep`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return {
            success: false,
            error: err?.error || `Save demo failed (${res.status})`,
          };
        }
        const data = await res.json(); // { token, user }
        if (!data?.token)
          return { success: false, error: "No token returned from server." };

        setToken(data.token);
        setUser(data.user || null);
        try {
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.removeItem(DEMO_FLAG_KEY);
        } catch {}
        return { success: true };
      } catch (e) {
        console.error("keepDemo() failed:", e);
        return { success: false, error: "Network error during demo save." };
      }
    },
    [getAuthHeaders]
  );

  /**
   * DEMO: discard guest sandbox (auth required)
   */
  const discardDemo = useCallback(async () => {
    try {
      // best-effort; even if server fails, we clear client state
      await fetch(`${API_BASE}/api/demo/discard`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
      }).catch(() => {});
    } finally {
      setUser(null);
      setToken(null);
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(DEMO_FLAG_KEY);
      } catch {}
    }
    return { success: true };
  }, [getAuthHeaders]);

  const refreshMe = useCallback(async () => {
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`Failed to fetch /me (${res.status})`);
      const me = await res.json();
      setUser(me);
      return me;
    } catch (e) {
      console.error("refreshMe failed:", e);
      return null;
    }
  }, [getAuthHeaders, token]);

  /**
   * Domain method: toggle public mode with optimistic UI + rollback on failure.
   */
  const setPublic = useCallback(
    async (nextIsPublic) => {
      if (!user) return;
      const prev = user;
      // Optimistic update
      setUser({ ...user, is_public: nextIsPublic });
      try {
        const res = await fetch(`${API_BASE}/api/auth/me/is-public`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ is_public: nextIsPublic }),
        });
        if (!res.ok)
          throw new Error(`Failed to update public mode (${res.status})`);
        const updated = await res.json(); // { id, username, is_public }
        // Ensure we keep any other fields we track on user:
        setUser((u) => (u ? { ...u, ...updated } : updated));
        return updated;
      } catch (e) {
        console.error("setPublic failed, rolling back:", e);
        // Rollback
        setUser(prev);
        throw e;
      }
    },
    [user, getAuthHeaders]
  );

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!token,
      isGuest,
      loading,
      getAuthHeaders,
      // auth
      login,
      register,
      logout,
      // demo
      startDemo,
      keepDemo,
      discardDemo,
      // misc
      refreshMe,
      setPublic,
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
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Optional convenience hook
export const useAuth = () => useContext(AuthContext);
