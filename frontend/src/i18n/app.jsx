/**
 * ═══════════════════════════════════════════════════════════════════════════
 * I18N FIX — HOW TO MAKE YOUR WHOLE APP CHANGE LANGUAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY IT WASN'T WORKING:
 * ─────────────────────
 * React only re-renders a component when ITS OWN state/context changes.
 * If a component doesn't call `useLanguage()`, it never re-renders when
 * the language changes — it keeps showing its old, hardcoded strings.
 *
 * THE ROOT CAUSE in your app is one (or both) of these:
 *
 *   1. Some components use hardcoded strings instead of t('key')
 *   2. The <LanguageProvider> is NOT wrapping the entire app in main.jsx
 *
 * THE FIX:
 * ────────
 * Use the `_renderKey` from LanguageContext as a `key` prop on your root
 * <Routes> (or <App> inner content). When key changes, React unmounts and
 * remounts the entire tree — all strings re-render with the new language.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── STEP 1: main.jsx ─────────────────────────────────────────────────────────
// Make sure LanguageProvider wraps EVERYTHING, including BrowserRouter:
//
//   import { LanguageProvider } from '@/i18n/LanguageContext';
//
//   ReactDOM.createRoot(document.getElementById('root')).render(
//     <LanguageProvider>
//       <BrowserRouter>
//         <App />
//       </BrowserRouter>
//     </LanguageProvider>
//   );
//
// ── STEP 2: App.jsx (or your root Routes component) ─────────────────────────
// Add `key={_renderKey}` to your <Routes> so the whole app re-renders
// whenever the language changes:

import { Routes, Route } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';

// Import all your pages/routes as normal...

const App = () => {
  const { _renderKey } = useLanguage();

  return (
    // ↓ This single `key` prop is the magic — when language changes,
    //   React destroys and recreates the entire Routes tree, so every
    //   component re-renders and all t() calls return new strings.
    <Routes key={_renderKey}>
      {/* Your existing routes go here unchanged */}
      {/*
      <Route path="/" element={<HomePage />} />
      <Route path="/rider/*" element={<RiderPortal />} />
      <Route path="/driver/*" element={<DriverPortal />} />
      <Route path="/admin/*" element={<AdminPortal />} />
      */}
    </Routes>
  );
};

export default App;


// ── STEP 3: Any component that still shows old language ──────────────────────
// Make sure every component that shows user-facing text calls useLanguage():
//
//   import { useLanguage } from '@/i18n/LanguageContext';
//
//   const MyComponent = () => {
//     const { t } = useLanguage();          // ← must be present
//     return <h1>{t('hero_title')}</h1>;    // ← use t() not hardcoded strings
//   };
//
// Components that DON'T call useLanguage() won't re-render on language change
// (unless their parent has key={_renderKey} as in Step 2).
//
// ── QUICK CHECKLIST ──────────────────────────────────────────────────────────
// ✓ LanguageProvider wraps entire app in main.jsx (outside BrowserRouter)
// ✓ <Routes key={_renderKey}> in App.jsx
// ✓ Every page/component calls useLanguage() and uses t('key')
// ✓ No hardcoded Georgian/English strings in JSX (use t() instead)
// ─────────────────────────────────────────────────────────────────────────────