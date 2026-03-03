import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/config'; 
import { LanguageProvider } from '@/i18n/LanguageContext';
import RiderPortal from '@/components/RiderPortal';
import '@/App.css';

// IMMEDIATE TEST: If the script loads, the screen turns red.
document.body.style.backgroundColor = "red"; 

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      {/* Visual confirmation inside React */}
      <div style={{position: 'fixed', top: 0, left: 0, background: 'white', color: 'black', zIndex: 9999, padding: '10px'}}>
        REACT IS RUNNING
      </div>
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