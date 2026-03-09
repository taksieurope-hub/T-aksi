import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/config'; 
import { LanguageProvider } from '@/i18n/LanguageContext';
import RiderPortal from '@/components/RiderPortal';
import '@/App.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <LanguageProvider>
        <AuthProvider>
          <Suspense fallback={<div className="min-h-screen bg-[#08080f]" />}>
            <RiderPortal />
          </Suspense>
        </AuthProvider>
      </LanguageProvider>
    </React.StrictMode>
  );
}
