import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * INTELLIGENT URL CONFIGURATION
 * Automatically adds '/api' if missing.
 */
const getBaseUrl = () => {
  // 1. Get URL from Environment (Render) or default to Localhost
  let url = import.meta.env.VITE_API_URL || "http://localhost:8000";
  
  // 2. Remove trailing slashes (e.g. "com/" -> "com")
  url = url.replace(/\/+$/, "");

  // 3. Ensure it ends with '/api'
  if (!url.endsWith("/api")) {
    url += "/api";
  }

  return url;
};

export const API = getBaseUrl();
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// ✅ Context Setup
export const AuthContext = createContext(null);

const safeJsonParse = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = safeJsonParse(localStorage.getItem("user"));
    if (token && userData) setUser(userData);
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
