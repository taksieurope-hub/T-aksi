// src/index.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { LanguageProvider } from "./i18n";
import App from "./App.jsx";
import "./index.css";

// Register service worker for push notifications + PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(reg => {
        console.log("SW registered:", reg.scope);
      })
      .catch(err => {
        console.warn("SW registration failed:", err);
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
