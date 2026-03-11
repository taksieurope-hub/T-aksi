// src/index.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';

// === Use the BARREL export (cleanest & avoids duplicates) ===
import { LanguageProvider } from './i18n';           // ← this pulls from i18n/index.js
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>     {/* ← wraps everything - required for i18n */}
      <App />
    </LanguageProvider>
  </React.StrictMode>
);