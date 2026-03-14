// src/i18n/LanguageContext.jsx
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { translations, defaultLanguage, languageNames } from './translations';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem('taksi_language');
    if (saved && translations[saved]) return saved;
    return defaultLanguage; // 'ka'
  });

  useEffect(() => {
    localStorage.setItem('taksi_language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  // t() is rebuilt whenever `language` changes, so every component that calls
  // useLanguage() automatically re-renders with fresh translations.
  // No renderKey / remount hack needed.
  const t = useCallback((key) => {
    if (!key) return '';
    return (
      translations[language]?.[key] ||
      translations[defaultLanguage]?.[key] ||
      translations.en?.[key] ||
      key
    );
  }, [language]);

  const changeLanguage = useCallback((newLanguage) => {
    if (translations[newLanguage]) {
      setLanguageState(newLanguage);
    }
  }, []);

  // useMemo so the context object reference only changes when language changes —
  // this is what triggers re-renders in every subscribed portal/component.
  const value = useMemo(() => ({
    language,
    setLanguage: changeLanguage,
    t,
    languages: languageNames,
    availableLanguages: Object.keys(translations),
  }), [language, t, changeLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};