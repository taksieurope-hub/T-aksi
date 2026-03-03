import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/config'; 
import { LanguageProvider } from '@/i18n/LanguageContext';
import RiderPortal from './RiderPortal'; 
import '@/App.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        {/* Suspense is required here if any part of RiderPortal is lazy-loaded */}
        <Suspense fallback={<div className="min-h-screen bg-[#08080f]" />}>
          <RiderPortal />
        </Suspense>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);