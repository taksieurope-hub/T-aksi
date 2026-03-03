import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from "react-router-dom";
import DriverPortal from '@/components/DriverPortal'; // 👈 Importing from your components folder
import { AuthProvider } from '@/config';
import { LanguageProvider } from '@/i18n/LanguageContext';
import '@/App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter basename="/driver">
          <DriverPortal />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);