import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from "react-router-dom";
import DriverPortal from '@/components/DriverPortal';
import { AuthProvider } from '@/config';
import { LanguageProvider, useLanguage } from '@/i18n/LanguageContext';
import '@/App.css';

// Wrapper that applies _renderKey so language switches force a full re-render
const DriverApp = () => {
  const { _renderKey } = useLanguage();
  return (
    <div key={_renderKey}>
      <BrowserRouter basename="/driver">
        <DriverPortal />
      </BrowserRouter>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <DriverApp />
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);