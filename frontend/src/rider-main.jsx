import React from 'react';
import { createRoot } from 'react-dom/client';
import RiderPortal from './RiderPortal'; // Ensure this path is correct
import { AuthProvider } from '@/config'; // Or wherever your AuthProvider lives
import { LanguageProvider } from '@/i18n/LanguageContext';
import '@/App.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <RiderPortal />
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);