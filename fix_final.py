import re

# 1. Remove VitePWA from vite.config.js entirely
path = "frontend/vite.config.js"
c = open(path, encoding="utf-8").read()
c = c.replace("import { VitePWA } from 'vite-plugin-pwa'\n", "")
c = re.sub(r"\s*VitePWA\(\{[^}]*(?:\{[^}]*\}[^}]*)*\}\),", "", c, flags=re.DOTALL)
open(path, "w", encoding="utf-8").write(c)
print("Fix 1: VitePWA removed from vite config")

# 2. Fix main.jsx - clean SW registration
path = "frontend/src/main.jsx"
c = open(path, encoding="utf-8").read()
new_main = """import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LanguageProvider } from './i18n/LanguageContext';
import App from './App';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister());
    }).then(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
);
"""
open(path, "w", encoding="utf-8").write(new_main)
print("Fix 2: main.jsx cleaned up")

# 3. Fix ALL dark map styles everywhere
import glob
for path in glob.glob("frontend/src/**/*.jsx", recursive=True):
    try:
        c = open(path, encoding="utf-8").read()
    except: continue
    orig = c
    c = c.replace('"#0d0d1a"', '"#1a1a2e"')
    c = c.replace('"#1f2937"', '"#4a5568"')
    c = c.replace('"#6b7280"', '"#ffffff"')
    c = c.replace('"#9ca3af"', '"#ffffff"')
    c = c.replace('"#111827"', '"#0e1626"')
    if c != orig:
        open(path, "w", encoding="utf-8").write(c)
        print(f"Fix 3: map styles fixed in {path}")
