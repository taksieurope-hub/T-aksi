import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

// --- FIX: Import Shared Logic from Config ---
import { API, AuthContext, useAuth } from "@/config";

// Import Components
import LandingPage from "@/components/LandingPage";
import RiderPortal from "@/components/RiderPortal";
import DriverPortal from "@/components/DriverPortal"; // <--- ADDED BACK

// I18N
import { LanguageProvider } from "@/i18n/LanguageContext";
export { useLanguage } from "@/i18n/LanguageContext"; 

// Axios Interceptor (YOUR LOGIC)
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("taksi_token");
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

// Stars Background (YOUR LOGIC)
const StarsBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    {[...Array(50)].map((_, i) => (
      <div key={i} className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
        style={{
          top: Math.random() * 100 + '%',
          left: Math.random() * 100 + '%',
          animationDuration: (2 + Math.random() * 3) + 's',
          opacity: Math.random() * 0.5,
        }}
      />
    ))}
  </div>
);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const savedUser = localStorage.getItem("taksi_user");
      const token = localStorage.getItem("taksi_token");
      if (savedUser && token) {
        try {
          const res = await axios.get(API + "/auth/me");
          setUser(res.data);
          localStorage.setItem("taksi_user", JSON.stringify(res.data));
        } catch (e) {
          localStorage.removeItem("taksi_token");
          localStorage.removeItem("taksi_user");
          setUser(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = (token, userData) => {
    localStorage.setItem("taksi_token", token);
    localStorage.setItem("taksi_user", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("taksi_token");
    localStorage.removeItem("taksi_user");
    setUser(null);
    toast.success("Logged out successfully");
  };

  const updateUser = (newData) => {
    const updated = { ...user, ...newData };
    setUser(updated);
    localStorage.setItem("taksi_user", JSON.stringify(updated));
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-black"><div className="w-16 h-16 border-4 border-[#00ff88] border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <LanguageProvider>
      <AuthContext.Provider value={{ user, login, logout, updateUser }}>
        <div className="App min-h-screen bg-black relative">
          <StarsBackground />
          <div className="relative z-10">
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/rider/*" element={<RiderPortal />} />
                <Route path="/driver/*" element={<DriverPortal />} /> 
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </div>
          <Toaster position="top-center" richColors />
        </div>
      </AuthContext.Provider>
    </LanguageProvider>
  );
}

export default App;
