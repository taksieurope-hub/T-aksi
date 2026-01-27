import { useState, useEffect, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { App as CapApp } from '@capacitor/app';

// Components
import LandingPage from "@/components/LandingPage";
import RiderPortal from "@/components/RiderPortal";
import DriverPortal from "@/components/DriverPortal";
import AdminPortal from "@/components/AdminPortal";

// i18n
import { LanguageProvider } from "@/i18n/LanguageContext";
export { useLanguage } from "@/i18n/LanguageContext";

// --- EXPORTS ---
export const BACKEND_URL = import.meta.env.PROD 
  ? "https://t-aksi.onrender.com" 
  : "http://localhost:8000";

export const API = `${BACKEND_URL}/api`;
export const GOOGLE_MAPS_API_KEY = "AIzaSyC2gkANH8GJOZNDdibTCKNEOWiuf580bxA";

export const AuthContext = createContext(null);

// This is the specific line RiderPortal was screaming about!
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

// --- AXIOS INTERCEPTORS ---
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("taksi_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- HELPER COMPONENTS ---
const StarsBackground = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {[...Array(100)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${2 + Math.random() * 3}s`,
            opacity: Math.random() * 0.7 + 0.3,
          }}
        />
      ))}
    </div>
  );
};

const BackButtonHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const backListener = CapApp.addListener('backButton', ({ canGoBack }) => {
      const isMainScreen = location.pathname === '/' || 
                           location.pathname === '/driver/dashboard' || 
                           location.pathname === '/rider/dashboard';

      if (isMainScreen) {
        console.log("Exit prevented on main screen.");
      } else {
        window.history.back();
      }
    });

    return () => {
      backListener.then(l => l.remove());
    };
  }, [location, navigate]);

  return null;
};

// --- MAIN APP COMPONENT ---
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const savedUser = localStorage.getItem("taksi_user");
      const token = localStorage.getItem("taksi_token");

      if (savedUser && token) {
        try {
          const res = await axios.get(`${API}/auth/me`);
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-16 h-16 border-4 border-[#00ff88] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <LanguageProvider>
      <AuthContext.Provider value={{ user, login, logout, updateUser }}>
        <div className="App min-h-screen bg-black relative">
          <StarsBackground />
          <div className="relative z-10">
            <BrowserRouter>
              <BackButtonHandler />
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/rider/*" element={<RiderPortal />} />
                <Route path="/driver/*" element={<DriverPortal />} />
                <Route path="/admin/*" element={<AdminPortal />} />
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