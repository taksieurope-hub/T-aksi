// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useLanguage } from './i18n/LanguageContext';

// === PUBLIC PAGES ===
import LandingPage from './LandingPage';

// === MAIN PORTALS ===
import RiderPortal from './RiderPortal';
import DriverPortal from './DriverPortal';
import AdminPortal from './AdminPortal';

// === EXTRA PAGES / FALLBACKS (if you have them) ===
import { useEffect } from 'react';

// Optional: Simple auth check (Firebase already used in portals)
const ProtectedRoute = ({ children, requiredRole }) => {
  // You can enhance this later with real Firebase auth
  const isAuthenticated = localStorage.getItem('firebaseUser') || true; // placeholder
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return children;
};

const App = () => {
  const { _renderKey, t } = useLanguage();

  useEffect(() => {
    document.title = t('app_name') + " – " + t('app_tagline');
  }, [t]);

  return (
    <div className="app-container" key={_renderKey}>
      <Routes>
        {/* PUBLIC LANDING */}
        <Route path="/" element={<LandingPage />} />

        {/* RIDER PORTAL */}
        <Route
          path="/rider"
          element={
            <ProtectedRoute>
              <RiderPortal />
            </ProtectedRoute>
          }
        />

        {/* DRIVER / PILOT PORTAL */}
        <Route
          path="/driver"
          element={
            <ProtectedRoute>
              <DriverPortal />
            </ProtectedRoute>
          }
        />

        {/* ADMIN PORTAL */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminPortal />
            </ProtectedRoute>
          }
        />

        {/* FUTURE ROUTES (add more here) */}
        {/* <Route path="/chat" element={<ChatWidget />} /> */}
        {/* <Route path="/support" element={<SupportChatWidget />} /> */}

        {/* 404 FALLBACK */}
        <Route
          path="*"
          element={
            <div className="min-h-screen flex items-center justify-center text-white text-center">
              <div>
                <h1 className="text-6xl font-bold mb-4">404</h1>
                <p className="text-xl">{t('error')} – {t('back')}</p>
              </div>
            </div>
          }
        />
      </Routes>
    </div>
  );
};

export default App;