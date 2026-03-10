// src/i18n/LanguageContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations, defaultLanguage, languageNames } from './translations';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem('taksi_language');
    if (saved && translations[saved]) return saved;
    const browserLang = typeof window !== 'undefined' && navigator.language 
      ? navigator.language.split('-')[0].toLowerCase() 
      : null;
    if (browserLang && translations[browserLang]) return browserLang;
    return 'en';
  });

  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    localStorage.setItem('taksi_language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const t = useCallback((key) => {
    return translations[language]?.[key] || translations[defaultLanguage]?.[key] || key;
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
      {/* TEMP DEBUG — remove after fixing */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, zIndex: 99999,
        background: 'red', color: 'white', fontSize: 12, padding: '2px 8px',
        fontFamily: 'monospace', pointerEvents: 'none'
      }}>
        LANG: {language} | KEY: {renderKey}
      </div>
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