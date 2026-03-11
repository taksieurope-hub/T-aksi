// src/i18n/LanguageContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations, defaultLanguage, languageNames } from './translations';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem('taksi_language');
    if (saved && translations[saved]) return saved;
    // FORCE Georgian for Georgia users
    return defaultLanguage; // 'ka'
  });

  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    localStorage.setItem('taksi_language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const t = useCallback((key) => {
    if (!key) return '';
    return (
      translations[language]?.[key] ||
      translations[defaultLanguage]?.[key] ||
      translations.en?.[key] ||  // extra English safety net
      key
    );
  }, [language]);

  const changeLanguage = useCallback((newLanguage) => {
    if (translations[newLanguage]) {
      setLanguageState(newLanguage);
      setRenderKey((prev) => prev + 1);
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