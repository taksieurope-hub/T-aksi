// frontend/src/config.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * IMPORTANT:
 * Set VITE_API_URL in frontend/.env
 *
 * If your backend routes are like:
 *   POST /auth/login
 * then use:
 *   VITE_API_URL=https://t-aksi.onrender.com
 *
 * If your backend routes are like:
 *   POST /api/auth/login
 * then use:
 *   VITE_API_URL=https://t-aksi.onrender.com/api
 */
export const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// ✅ Exported so App.jsx can import it without build failing
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

  // On load: restore user from localStorage
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

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      updateUser,
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
