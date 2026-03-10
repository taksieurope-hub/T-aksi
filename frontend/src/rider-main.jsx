import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/config';
import { LanguageProvider, useLanguage } from '@/i18n/LanguageContext';
import RiderPortal from '@/components/RiderPortal';
import '@/App.css';

const RiderApp = () => {
  const { _renderKey } = useLanguage();
  return (
    <div key={_renderKey}>
      <Suspense fallback={<div className="min-h-screen bg-[#08080f]" />}>
        <RiderPortal />
      </Suspense>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <LanguageProvider>
        <AuthProvider>
          <RiderApp />
        </AuthProvider>
      </LanguageProvider>
    </React.StrictMode>
  );
}