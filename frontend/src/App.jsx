import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

// --- IMPORT SHARED CONFIG (Crucial Fix) ---
import { API, AuthContext } from "@/config";

import LandingPage from "@/components/LandingPage";
import RiderPortal from "@/components/RiderPortal";
import DriverPortal from "@/components/DriverPortal"; 

import { LanguageProvider } from "@/i18n/LanguageContext";

// DO NOT EXPORT API OR useAuth FROM HERE.
// THEY MUST COME FROM @/config

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

      const timeout = setTimeout(() => setLoading(false), 5000);

      if (savedUser && token) {
        try {
          const localData = JSON.parse(savedUser);
          setUser(localData);
          axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
          
          const res = await axios.get(`${API}/auth/me`);
          setUser(res.data);
          localStorage.setItem("taksi_user", JSON.stringify(res.data));
        } catch (e) {
          console.error("Auth refresh failed");
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