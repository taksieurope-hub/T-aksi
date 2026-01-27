import { useState, useEffect, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { App as CapApp } from '@capacitor/app'; // <--- NEW: Import Capacitor App

// Components
import LandingPage from "@/components/LandingPage";
import RiderPortal from "@/components/RiderPortal";
import DriverPortal from "@/components/DriverPortal";
import AdminPortal from "@/components/AdminPortal";

// i18n
import { LanguageProvider } from "@/i18n/LanguageContext";
export { useLanguage } from "@/i18n/LanguageContext";

// ... [Keep your existing API and Axios Interceptor code exactly as it is] ...

// Helper component to handle the back button (since it needs access to React Router)
const BackButtonHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const backListener = CapApp.addListener('backButton', ({ canGoBack }) => {
      // If we are on a main dashboard or the landing page, don't let the app close
      const isMainScreen = location.pathname === '/' || 
                           location.pathname === '/driver' || 
                           location.pathname === '/rider';

      if (isMainScreen) {
        // Option: toast.info("Press home to exit"); or do nothing
        console.log("On main screen, back button exit prevented.");
      } else if (canGoBack) {
        window.history.back();
      } else {
        navigate(-1); // Fallback to go back in React Router
      }
    });

    return () => {
      backListener.then(l => l.remove());
    };
  }, [location, navigate]);

  return null; // This component doesn't render anything
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ... [Keep your existing useEffect for Auth, login, logout, and updateUser functions] ...

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#00ff88] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#00ff88]">Initializing T'aksi...</p>
        </div>
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
              <BackButtonHandler /> {/* <--- NEW: This handles the Android Back Button */}
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