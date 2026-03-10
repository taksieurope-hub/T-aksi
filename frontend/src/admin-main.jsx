import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from "react-router-dom";
import AdminPortal from '@/components/AdminPortal';
import { AuthProvider } from '@/config';
import { LanguageProvider, useLanguage } from '@/i18n/LanguageContext';
import { Toaster } from "@/components/ui/sonner";
import '@/App.css';

const AdminApp = () => {
  const { _renderKey } = useLanguage();
  return (
    <div key={_renderKey} className="min-h-screen bg-[#07070f]">
      <BrowserRouter basename="/admin">
        <AdminPortal />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <AdminApp />
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);