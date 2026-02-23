import { useMemo } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import InstallPrompt from '@/components/InstallPrompt'; // ✅ Imported correctly

// Providers
import { AuthProvider, API } from "@/config";
import { LanguageProvider } from "@/i18n/LanguageContext";

// Pages / Portals
import LandingPage from "@/components/LandingPage";
import RiderPortal from "@/components/RiderPortal";
import DriverPortal from "@/components/DriverPortal";
import AdminPortal from "@/components/AdminPortal";

// Global Components
import SupportChatWidget from "@/components/SupportChatWidget";

/**
 * Axios interceptor (Global)
 */
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (!config.baseURL && API) {
    config.baseURL = API;
  }
  return config;
});

/**
 * Stars background (memoized)
 */
const StarsBackground = () => {
  const stars = useMemo(() => {
    return [...Array(50)].map((_, i) => ({
      id: i,
      top: Math.random() * 100,
      left: Math.random() * 100,
      duration: 2 + Math.random() * 3,
      opacity: Math.random() * 0.5,
    }));
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            animationDuration: `${s.duration}s`,
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
};

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <div className="App min-h-screen bg-black relative">
          <StarsBackground />

          {/* 🔥 THE AGGRESSIVE INSTALL PROMPT LIVES HERE! */}
          <InstallPrompt />

          <div className="relative z-10">
            <BrowserRouter>
              <Routes>
                {/* Public Landing Page */}
                <Route path="/" element={<LandingPage />} />

                {/* Public trip tracking */}
                <Route path="/track/:rideId" element={<LandingPage />} />

                <Route path="/admin/*" element={<AdminPortal />} />
                
                <Route path="/rider/*" element={<RiderPortal />} />
                <Route path="/driver/*" element={<DriverPortal />} />

                {/* Fallback - Redirect unknown routes to Landing Page */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              
              {/* Global Support Chat Widget */}
              <SupportChatWidget />
            </BrowserRouter>
          </div>

          <Toaster position="top-center" richColors />
        </div>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;