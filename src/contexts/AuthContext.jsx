import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useContext,
} from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(
    () => localStorage.getItem("token") || null
  );
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

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
          localStorage.removeItem("token");
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

  const login = useCallback((nextToken, nextUser) => {
    setToken(nextToken);
    localStorage.setItem("token", nextToken);
    setUser(nextUser ?? null);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem("token");
    setUser(null);
  }, []);

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
      loading,
      getAuthHeaders,
      login,
      logout,
      refreshMe,
      setPublic, // ← smart, single source of truth mutation
    }),
    [user, token, loading, getAuthHeaders, login, logout, refreshMe, setPublic]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Optional convenience hook
export const useAuth = () => useContext(AuthContext);
