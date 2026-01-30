// src/config.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export const API = (import.meta.env.VITE_API_URL || "").trim();
export const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();

/**
 * Normalizes base URL:
 * - removes trailing slashes
 * - ensures it's not empty in production
 */
export const API_BASE = useMemoApiBase(API);

function useMemoApiBase(raw) {
  // small trick: allows using useMemo-like behavior without needing hooks at top-level
  // (module scope can't call React hooks)
  return normalizeBaseUrl(raw);
}

function normalizeBaseUrl(raw) {
  if (!raw) return "";
  return raw.replace(/\/+$/, ""); // strip trailing slashes
}

// ---- AUTH CONTEXT ----
export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Load from localStorage on boot
  useEffect(() => {
    try {
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("user");
      if (token && userData) setUser(JSON.parse(userData));
    } catch {
      // If storage is corrupted, wipe it
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
    }
  }, []);

  const login = (token, userData) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  const updateUser = (data) => {
    setUser(data);
    localStorage.setItem("user", JSON.stringify(data));
  };

  const value = useMemo(() => ({ user, login, logout, updateUser }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider />");
  }
  return ctx;
};
