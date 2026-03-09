// src/i18n/LanguageContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations, defaultLanguage, languageNames } from './translations';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    // 1. User Preference: Did they manually pick a language last time?
    const saved = localStorage.getItem('taksi_language');
    if (saved && translations[saved]) return saved;

    // 2. Auto-Detect: Look at their phone/browser settings (e.g., "de-DE" becomes "de")
    const browserLang = typeof window !== 'undefined' && navigator.language 
      ? navigator.language.split('-')[0].toLowerCase() 
      : null;

    // 3. Match: If we support their native language, serve it instantly
    if (browserLang && translations[browserLang]) {
      return browserLang;
    }

    // 4. Tourist Fallback: If we don't have their language, give them English (not Georgian)
    return 'en';
  });

  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    localStorage.setItem('taksi_language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'; // RTL for Arabic if added
  }, [language]);

  const t = useCallback((key) => {
    return translations[language]?.[key] || translations[defaultLanguage]?.[key] || key;
  }, [language]);

  const changeLanguage = useCallback((newLanguage) => {
    if (translations[newLanguage]) {
      setLanguageState(newLanguage);
      setRenderKey((prev) => prev + 1); // Force re-render for RTL/LTR changes
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ 
      language, 
      setLanguage: changeLanguage, 
      t, 
      languages: languageNames,
      availableLanguages: Object.keys(translations),
      _renderKey: renderKey 
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};

export default LanguageContext;