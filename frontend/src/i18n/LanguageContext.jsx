import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations, defaultLanguage, languageNames } from './translations';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    // Check localStorage first
    const saved = localStorage.getItem('taksi_language');
    if (saved && translations[saved]) return saved;

    // Try browser language
    const browserLang = navigator.language?.slice(0, 2);
    if (browserLang && translations[browserLang]) return browserLang;

    return defaultLanguage;
  });

  // Increment this to force all consumers to re-render on language change
  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    localStorage.setItem('taksi_language', language);
    document.documentElement.lang = language;
    // Force a re-render cycle so ALL child components receive updated t()
    setRenderKey(k => k + 1);
  }, [language]);

  const t = useCallback((key) => {
    return translations[language]?.[key] || translations.en?.[key] || key;
  }, [language]);

  const changeLanguage = useCallback((lang) => {
    if (lang && translations[lang]) {
      setLanguageState(lang);
    }
  }, []);

  const value = {
    language,
    setLanguage: changeLanguage,
    t,
    languages: languageNames,
    availableLanguages: Object.keys(translations),
    // renderKey lets components that need it force a full re-render
    _renderKey: renderKey,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export default LanguageContext;