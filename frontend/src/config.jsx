// src/config.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

// --- ENV ---
const rawApi = import.meta.env.VITE_API_URL || "";
export const API = rawApi.replace(/\/+$/, ""); // remove trailing slashes
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Guard: warn loudly if you forgot to set VITE_API_URL during build
// (Render/Vite bakes env vars into the build output)
if (import.meta.env.PROD) {
  if (!API) {
    // eslint-disable-next-line no-console
    console.error(
      "[CONFIG] VITE_API_URL is missing. Your frontend will call undefined endpoints and fail."
    );
  }
  if (API.includes("your-backend.onrender.com")) {
    // eslint-disable-next-line no-console
    console.error(
      "[CONFIG] VITE_API_URL is still set to the placeholder 'your-backend.onrender.com'. Update it and redeploy."
    );
  }
}

// --- AUTH CONTEXT ---
export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Load existing session once
  useEffect(() => {
    try {
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("user");
      if (token && userData) setUser(JSON.parse(userData));
    } catch (e) {
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

  // Memoize to avoid unnecessary re-renders
  const value = useMemo(
    () => ({ user, login, logout, updateUser }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
};
