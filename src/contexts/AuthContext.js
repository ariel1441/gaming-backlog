import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true); // loading state for token check

  const TOKEN_KEY = 'admin_token';

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token);

  const clearToken = () => localStorage.removeItem(TOKEN_KEY);

  const getAuthHeaders = () => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const login = async (password) => {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', { password });
      const { token } = response.data;
      saveToken(token);
      setIsAdmin(true);
      return { success: true };
    } catch (error) {
      console.error('Login failed:', error.response?.data || error.message);
      return { success: false, error: error.response?.data?.error || 'Login failed' };
    }
  };

  const logout = () => {
    clearToken();
    setIsAdmin(false);
  };

  const verifyToken = async () => {
    const token = getToken();
    if (!token) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    try {
      const res = await axios.get('http://localhost:5000/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      });

      setIsAdmin(res.data?.isAdmin === true);
    } catch (err) {
      console.warn('Token verification failed:', err.response?.data || err.message);
      clearToken();
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verifyToken();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white text-sm">
        Checking admin access...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ isAdmin, login, logout, loading, getAuthHeaders }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
