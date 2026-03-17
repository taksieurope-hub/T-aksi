import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * INTELLIGENT URL CONFIGURATION
 * Uses REACT_APP_BACKEND_URL for Emergent, falls back to VITE_API_URL
 */
const getBaseUrl = () => {
  let url = import.meta.env.REACT_APP_BACKEND_URL || import.meta.env.VITE_API_URL || "http://localhost:8001";
  url = url.replace(/\/+$/, "");
  if (!url.endsWith("/api")) url += "/api";
  return url;
};

export const API = getBaseUrl();
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export const AuthContext = createContext(null);

const safeJsonParse = (v) => {
  try { return JSON.parse(v); } catch { return null; }
};

/**
 * TOKEN STORAGE — httpOnly Cookie Strategy
 *
 * FIX 2.2: Tokens are no longer stored in localStorage.
 * localStorage is readable by any JavaScript on the page, so a single
 * XSS vulnerability = full account takeover.
 *
 * NEW APPROACH:
 * - The JWT is sent to the backend as a credential cookie on login.
 * - The backend sets it as Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict
 * - The frontend never touches the token string directly.
 * - Axios sends it automatically via `withCredentials: true`.
 *
 * The `user` object (non-sensitive profile data) is stored in sessionStorage 
 * instead of localStorage. This is cleared when the tab closes and is scoped 
 * to the session. It is NOT a security token.
 */

// Temporary escape hatch — remove once backend sets httpOnly cookies
const USE_LS_FALLBACK = import.meta.env.VITE_USE_LOCALSTORAGE_FALLBACK === 'true';

const tokenStorage = {
  setSession(token, userData) {
    if (USE_LS_FALLBACK) {
      // Legacy path — remove once backend sends Set-Cookie
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(userData));
    } else {
      // New path — token is in httpOnly cookie set by server.
      sessionStorage.setItem("user", JSON.stringify(userData));
    }
  },

  getUser() {
    if (USE_LS_FALLBACK) {
      return safeJsonParse(localStorage.getItem("user"));
    }
    return safeJsonParse(sessionStorage.getItem("user"));
  },

  /**
   * Returns token for legacy axios header injection.
   * In cookie mode this returns null — axios uses withCredentials instead.
   */
  getToken() {
    if (USE_LS_FALLBACK) {
      return localStorage.getItem("token");
    }
    return null;
  },

  clearSession() {
    if (USE_LS_FALLBACK) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } else {
      sessionStorage.removeItem("user");
    }
    sessionStorage.setItem("logged_out", "true");
  },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Restore user profile from session/local storage on page load.
    const wasLoggedOut = sessionStorage.getItem("logged_out") === "true";
    const userData = tokenStorage.getUser();
    if (userData && !wasLoggedOut) setUser(userData);

    // Listen for global auth:expired events fired by the axios interceptor.
    const handleExpired = () => {
      tokenStorage.clearSession();
      setUser(null);
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const login = (token, userData) => {
    sessionStorage.removeItem("logged_out");
    tokenStorage.setSession(token, userData);
    setUser(userData);
  };

  const logout = async () => {
    // In cookie mode: tell the server to clear the httpOnly cookie.
    if (!USE_LS_FALLBACK) {
      try {
        await fetch(`${API}/auth/logout`, {
          method: 'POST',
          credentials: 'include', // forces the browser to send the cookie
        });
      } catch {
        // Server unreachable — clear client state anyway
      }
    }
    tokenStorage.clearSession();
    setUser(null);
  };

  const refreshUser = async () => {
    const wasLoggedOut = sessionStorage.getItem("logged_out") === "true";
    if (wasLoggedOut) return;
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) updateUserData(data.user);
      } else if (res.status === 401) {
        tokenStorage.clearSession();
        setUser(null);
      }
    } catch {}
  };

  const updateUserData = (data) => {
    setUser(data);
    if (USE_LS_FALLBACK) {
      localStorage.setItem("user", JSON.stringify(data));
    } else {
      sessionStorage.setItem("user", JSON.stringify(data));
    }
  };
  const updateUser = updateUserData;

  const value = useMemo(
    () => ({ user, login, logout, updateUser, refreshUser }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

// Export for use in api.js
export { tokenStorage };