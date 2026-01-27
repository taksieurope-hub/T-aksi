import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from './App.jsx';

// Import YOUR custom provider - this is the one that uses your translations.js
import { LanguageProvider } from './LanguageContext.jsx'; 

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {/* Use YOUR provider, not the i18next one */}
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);