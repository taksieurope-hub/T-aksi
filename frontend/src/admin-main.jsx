import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from "react-router-dom";
import AdminPortal from '@/components/AdminPortal'; // 👈 Pulling from your components
import { AuthProvider } from '@/config';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { Toaster } from "@/components/ui/sonner";
import '@/App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter basename="/admin">
          <div className="min-h-screen bg-[#07070f]">
            <AdminPortal />
            <Toaster position="top-right" richColors />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);