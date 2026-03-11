import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from './App.jsx';
import { LanguageProvider } from './i18n/LanguageContext';

// FIXED PATH: Points to the i18n folder
import { LanguageProvider } from "./i18n/LanguageContext"; 

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);