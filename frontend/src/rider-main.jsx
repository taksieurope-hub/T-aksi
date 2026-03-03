import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from "react-router-dom";
import RiderPortal from '@/components/RiderPortal'; // 👈 Importing from your components folder
import { AuthProvider } from '@/config';
import { LanguageProvider } from '@/i18n/LanguageContext';
import '@/App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter basename="/rider">
    <RiderPortal />
  </BrowserRouter>
);

// Change the top-level import to this:
const SupportChatWidget = lazy(() => import('./components/SupportChatWidget'));

// Wrap it in your code like this:
<Suspense fallback={null}>
  <SupportChatWidget />
</Suspense>

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter basename="/rider">
          <RiderPortal />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);