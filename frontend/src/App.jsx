// cd "C:\Users\edahl\Desktop\taksi app from emergent to render\frontend"

import { useState, useEffect, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

import LandingPage from "@/components/LandingPage";
import RiderPortal from "@/components/RiderPortal";
import DriverPortal from "@/components/DriverPortal";

import { LanguageProvider } from "@/i18n/LanguageContext";
export { useLanguage } from "@/i18n/LanguageContext"; 

export const API = "https://t-aksi.onrender.com/api";
export const GOOGLE_MAPS_API_KEY = "AIzaSyC2gkANH8GJOZNDdibTCKNEOWiuf580bxA"; 

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = () => {
      const savedUser = localStorage.getItem("taksi_user");
      const token = localStorage.getItem("taksi_token");

      if (savedUser && token) {
        // 1. LOAD INSTANTLY FROM PHONE MEMORY
        setUser(JSON.parse(savedUser));
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        
        // 2. SILENTLY VERIFY IN BACKGROUND (Don't make the user wait)
        axios.get(`${API}/auth/me`).then(res => {
          setUser(res.data);
          localStorage.setItem("taksi_user", JSON.stringify(res.data));
        }).catch(() => {
          // Only clear if the token is dead
          localStorage.removeItem("taksi_token");
        });
      }
      // Stop the spinner immediately if we have a saved user
      setLoading(false);
    };
    initAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-16 h-16 border-4 border-[#00ff88] border-t-transparent rounded-full animate-spin"></div>
        <p className="ml-4 text-[#00ff88]">Waking up T'aksi...</p>
      </div>
    );
  }

  return (
    <LanguageProvider>
      <AuthContext.Provider value={{ user, login: (t, u) => setUser(u), logout: () => setUser(null) }}>
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