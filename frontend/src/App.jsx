import { useMemo, lazy, Suspense, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import InstallPrompt from '@/components/InstallPrompt';

// Providers
import { AuthProvider, API } from "@/config";
import { LanguageProvider } from "@/i18n/LanguageContext";

// CODE SPLITTING
const LandingPage    = lazy(() => import("@/components/LandingPage"));
const RiderPortal    = lazy(() => import("@/components/RiderPortal"));
const DriverPortal   = lazy(() => import("@/components/DriverPortal"));
const AdminPortal    = lazy(() => import("@/components/AdminPortal"));
const CorporatePortal = lazy(() => import("@/components/CorporatePortal"));

const PortalLoader = () => (
  <div style={{
    minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexDirection: 'column', gap: '16px',
  }}>
    <div style={{
      width: '40px', height: '40px', border: '3px solid #222',
      borderTop: '3px solid #f5c842', borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// Global Axios setup
axios.defaults.withCredentials = true;
axios.interceptors.request.use((config) => {
  if (!config.baseURL && API) config.baseURL = API;
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    return Promise.reject(error);
  }
);

const StarsBackground = () => {
  const stars = useMemo(() => [...Array(50)].map((_, i) => ({
    id: i, top: Math.random() * 100, left: Math.random() * 100,
    duration: 2 + Math.random() * 3, opacity: Math.random() * 0.5,
  })), []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {stars.map((s) => (
        <div key={s.id} className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
          style={{ top: `${s.top}%`, left: `${s.left}%`, animationDuration: `${s.duration}s`, opacity: s.opacity }}
        />
      ))}
    </div>
  );
};

function App() {
  
  useEffect(() => {
    const initPush = async () => {
      // ONLY run this if we are on a real device (Capacitor)
      // This check prevents crashes in standard web browsers
      if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
          // DYNAMIC IMPORT: This fixes the Render build failure
          const { PushNotifications } = await import('@capacitor/push-notifications');

          let permStatus = await PushNotifications.checkPermissions();

          if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
          }

          if (permStatus.receive === 'granted') {
            await PushNotifications.register();

            await PushNotifications.addListener('registration', (token) => {
              console.log('Push Registration Success. Token:', token.value);
              axios.post("/api/user/push-token", { token: token.value })
                .catch(err => console.error("Backend failed to save push token", err));
            });

            await PushNotifications.addListener('registrationError', (error) => {
              console.error('Push Registration Error:', JSON.stringify(error));
            });

            await PushNotifications.addListener('pushNotificationReceived', (notification) => {
              console.log('Push received while app open:', notification);
            });

            await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
              console.log('User clicked notification:', notification);
            });
          }
        } catch (e) {
          console.error("Failed to load PushNotifications plugin:", e);
        }
      } else {
        console.log("Web environment detected: Skipping Native Push initialization.");
      }
    };

    initPush();
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <div className="App min-h-screen bg-black relative">
          <StarsBackground />
          <InstallPrompt />
          <div className="relative z-10">
            <BrowserRouter>
              <Suspense fallback={<PortalLoader />}>
                <Routes>
                  <Route path="/"               element={<LandingPage />} />
                  <Route path="/track/:rideId"  element={<LandingPage />} />
                  <Route path="/rider/*"        element={<RiderPortal />} />
                  <Route path="/business" element={<CorporatePortal />} />
        <Route path="/driver/*"       element={<DriverPortal />} />
                  <Route path="/admin/*"        element={<AdminPortal />} />
                  <Route path="/dashboard"      element={<Navigate to="/rider/dashboard" replace />} />
                  <Route path="*"               element={<Navigate to="/" replace />} />
                </Routes>
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