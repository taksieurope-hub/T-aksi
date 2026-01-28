import { useState, useEffect, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

// --- CRITICAL IMPORTS ---
import LandingPage from "@/components/LandingPage";
import RiderPortal from "@/components/RiderPortal";
import DriverPortal from "@/components/DriverPortal"; // <--- This was missing/broken

import { LanguageProvider } from "@/i18n/LanguageContext";
export { useLanguage } from "@/i18n/LanguageContext"; 

// --- CONFIGURATION ---
// Using VITE_ env variables correctly
export const API = import.meta.env.VITE_API_URL || "https://t-aksi.onrender.com/api";
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""; 

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- HELPER: Update user state locally (Required for Driver Toggle) ---
  const updateUser = (newData) => {
    setUser((prev) => {
      const updated = { ...prev, ...newData };
      localStorage.setItem("taksi_user", JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    const initAuth = async () => {
      const savedUser = localStorage.getItem("taksi_user");
      const token = localStorage.getItem("taksi_token");

      // FAIL-SAFE: If backend is slow, don't hang the app
      const timeout = setTimeout(() => {
        setLoading(false);
      }, 5000);

      if (savedUser && token) {
        try {
          // 1. Load local data immediately (Fast UI)
          const localData = JSON.parse(savedUser);
          setUser(localData);
          axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
          
          // 2. Refresh data from server in background
          const res = await axios.get(`${API}/auth/me`);
          setUser(res.data);
          localStorage.setItem("taksi_user", JSON.stringify(res.data));
        } catch (e) {
          console.error("Auth refresh failed, using local data.");
        }
      }
      
      clearTimeout(timeout);
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = (token, userData) => {
    localStorage.setItem("taksi_token", token);
    localStorage.setItem("taksi_user", JSON.stringify(userData));
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("taksi_token");
    localStorage.removeItem("taksi_user");
    delete axios.defaults.headers.common["Authorization"];
    setUser(null);
    toast.success("Logged out successfully");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black">
        <div className="w-16 h-16 border-4 border-[#00ff88] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[#00ff88] font-mono tracking-widest animate-pulse">BOOTING T'AKSI...</p>
      </div>
    );
  }

  return (
    <LanguageProvider>
      {/* PASS updateUser TO CONTEXT */}
      <AuthContext.Provider value={{ user, login, logout, updateUser }}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/rider/*" element={<RiderPortal />} />
            <Route path="/driver/*" element={<DriverPortal />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </AuthContext.Provider>
    </LanguageProvider>
  );
}

export default App;