// src/i18n/LanguageContext.jsx
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { translations, defaultLanguage, languageNames } from './translations';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem('taksi_language');
    if (saved && translations[saved] && saved !== 'en') return saved;
    return defaultLanguage; // 'ka'
  });

  useEffect(() => {
    localStorage.setItem('taksi_language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const t = useCallback((key) => {
    if (!key) return '';
    return (
      translations[language]?.[key] ||
      translations.en?.[key] ||
      translations[defaultLanguage]?.[key] ||
      key
    );
  }, [language]);

  const changeLanguage = useCallback((newLanguage) => {
    if (translations[newLanguage]) {
      setLanguageState(newLanguage);
    }
  }, []);

  const value = useMemo(() => ({
    _renderKey: language,
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
