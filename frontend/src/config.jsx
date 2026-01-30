// src/config.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

// --- ENV (always export these) ---
export const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, ""); // no trailing slash
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// --- AUTH CONTEXT (exported to match your App.jsx import) ---
export const AuthContext = createContext({
  user: null,
  token: null,
  isAuthReady: false,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
});

// --- STORAGE KEYS ---
const TOKEN_KEY = "token";
const USER_KEY = "user";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Load from localStorage once
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);

      if (storedToken) setToken(storedToken);
      if (storedUser) setUser(JSON.parse(storedUser));
    } catch (e) {
      // If parsing fails, clean it up
      localStorage.removeItem(USER_KEY);
    } finally {
      setIsAuthReady(true);
    }
  }, []);

  const login = (newToken, userData) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  };

  const updateUser = (data) => {
    setUser(data);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(data));
    } catch (e) {
      // ignore storage errors
    }
  };

  const value = useMemo(
    () => ({ user, token, isAuthReady, login, logout, updateUser }),
    [user, token, isAuthReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
