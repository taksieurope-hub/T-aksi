import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/config'; 
import { LanguageProvider } from '@/i18n/LanguageContext';
import RiderPortal from './components/RiderPortal'; // Path corrected
import '@/App.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
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