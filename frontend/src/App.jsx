import { useMemo, lazy, Suspense } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import InstallPrompt from '@/components/InstallPrompt';

// Providers
import { AuthProvider, API } from "@/config";
import { LanguageProvider } from "@/i18n/LanguageContext";

// CODE SPLITTING: All portals are now lazy-loaded.
// A rider only downloads RiderPortal JS. Driver only downloads DriverPortal.
// Admin only downloads AdminPortal. Cuts initial load from ~1MB to ~150KB.
const LandingPage    = lazy(() => import("@/components/LandingPage"));
const RiderPortal    = lazy(() => import("@/components/RiderPortal"));
const DriverPortal   = lazy(() => import("@/components/DriverPortal"));
const AdminPortal    = lazy(() => import("@/components/AdminPortal"));
const SupportChatWidget = lazy(() => import("@/components/SupportChatWidget"));

// Minimal loading fallback — shown while portal chunk downloads
// Matches the app's dark theme so there's no flash of white
const PortalLoader = () => (
  <div style={{
    minHeight: '100vh',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '16px',
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '3px solid #222',
      borderTop: '3px solid #f5c842',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// Global Axios setup
// withCredentials: true sends httpOnly cookies on every request (JWT cookie auth)
axios.defaults.withCredentials = true;
axios.interceptors.request.use((config) => {
  if (!config.baseURL && API) config.baseURL = API;
  return config;
});

// Interceptor: if server returns 401, clear local state and redirect to login
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Cookie expired or invalid — let AuthProvider handle the redirect
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    return Promise.reject(error);
  }
);

const StarsBackground = () => {
  const stars = useMemo(() => [...Array(50)].map((_, i) => ({
    id: i,
    top: Math.random() * 100,
    left: Math.random() * 100,
    duration: 2 + Math.random() * 3,
    opacity: Math.random() * 0.5,
  })), []);

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
          <InstallPrompt />
          <div className="relative z-10">
            <BrowserRouter>
              {/* Suspense wraps ALL routes — each portal shows PortalLoader while its chunk downloads */}
              <Suspense fallback={<PortalLoader />}>
                <Routes>
                  {/* Public Landing */}
                  <Route path="/"               element={<LandingPage />} />
                  <Route path="/track/:rideId"  element={<LandingPage />} />

                  {/* Portals — each is a separate JS chunk */}
                  <Route path="/rider/*"        element={<RiderPortal />} />
                  <Route path="/driver/*"       element={<DriverPortal />} />
                  <Route path="/admin/*"        element={<AdminPortal />} />

                  {/* Fallbacks */}
                  <Route path="/dashboard"      element={<Navigate to="/rider/dashboard" replace />} />
                  <Route path="*"               element={<Navigate to="/" replace />} />
                </Routes>

                {/* Support chat — lazy loaded, only renders when needed */}
                <SupportChatWidget />
              </Suspense>
            </BrowserRouter>
          </div>
          <Toaster position="top-center" richColors />
        </div>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;