// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useLanguage } from './i18n/LanguageContext';
import { useEffect } from 'react';

// === PUBLIC PAGES ===
import LandingPage from './LandingPage';

// === MAIN PORTALS ===
import RiderPortal from './RiderPortal';
import DriverPortal from './DriverPortal';
import AdminPortal from './AdminPortal';

const ProtectedRoute = ({ children }) => {
  // Placeholder – replace with real Firebase auth later
  const isAuthenticated = localStorage.getItem('firebaseUser') || true;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return children;
};

const App = () => {
  const { t } = useLanguage();

  useEffect(() => {
    document.title = t('app_name') + " – " + t('app_tagline');
  }, [t]);

  return (
    <div className="app-container">
      {/* No key= on Routes — language changes should never remount portals.
          Each portal subscribes to useLanguage() directly and re-renders
          on its own when the context value (language) changes. */}
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

        {/* DRIVER PORTAL */}
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
            <ProtectedRoute>
              <AdminPortal />
            </ProtectedRoute>
          }
        />

        {/* 404 */}
        <Route
          path="*"
          element={
            <div className="min-h-screen flex items-center justify-center text-white text-center">
              <h1 className="text-6xl font-bold">404</h1>
            </div>
          }
        />
      </Routes>
    </div>
  );
};

export default App;