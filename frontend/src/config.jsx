// src/config.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

/**
 * ENV expected:
 *  VITE_API_URL=https://t-aksi.onrender.com
 *  VITE_API_PREFIX=/api        (optional - if your backend routes are under /api)
 *  VITE_GOOGLE_MAPS_API_KEY=...
 */
export const API_BASE = (import.meta.env.VITE_API_URL || "").trim();
export const API_PREFIX = (import.meta.env.VITE_API_PREFIX || "").trim(); // e.g. "/api" or "" (empty)
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// ---- Helpers ----
const stripTrailingSlash = (s) => (s ? s.replace(/\/+$/, "") : "");
const ensureLeadingSlash = (s) => {
  if (!s) return "";
  return s.startsWith("/") ? s : `/${s}`;
};
const joinUrl = (base, prefix) => {
  const b = stripTrailingSlash(base);
  const p = ensureLeadingSlash(prefix);
  return `${b}${p}`;
};

// This is the ONE base the whole app should use for axios
export const API = joinUrl(API_BASE, API_PREFIX);

// ---- Auth Context ----
export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Load from localStorage immediately
  useEffect(() => {
    try {
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("user");
      if (token && userData) setUser(JSON.parse(userData));
    } catch {
      // If storage is corrupted
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

export const useAuth = () => useContext(AuthContext);

// ---- Axios Client (production-ready) ----
export const api = axios.create({
  baseURL: API,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Optional: handle auth errors globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // If backend uses 401 for invalid token, you can auto-logout here if you want.
    // Keep it gentle: don't wipe session on transient errors.
    return Promise.reject(err);
  }
);
