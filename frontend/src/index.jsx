// src/index.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { LanguageProvider } from "./i18n";
import App from "./App.jsx";
import "./index.css";

// Unregister any existing service workers - they cause white screen on refresh
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
