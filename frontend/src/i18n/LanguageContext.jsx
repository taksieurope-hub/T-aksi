import { createContext, useContext, useState, useEffect } from 'react';
import { translations, defaultLanguage, languageNames } from './translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // Check localStorage first, then browser language, then default to Georgian
    const saved = localStorage.getItem('taksi_language');
    if (saved && translations[saved]) return saved;
    
    // Try to detect browser language
    const browserLang = navigator.language?.slice(0, 2);
    if (browserLang && translations[browserLang]) return browserLang;
    
    return defaultLanguage; // Default to Georgian
  });

  useEffect(() => {
    localStorage.setItem('taksi_language', language);
    // Update HTML lang attribute for accessibility
    document.documentElement.lang = language;
  }, [language]);

  const t = (key) => {
    return translations[language]?.[key] || translations.en?.[key] || key;
  };

  const changeLanguage = (lang) => {
    if (translations[lang]) {
      setLanguage(lang);
    }
  };

  return (
    <LanguageContext.Provider value={{ 
      language, 
      setLanguage: changeLanguage, 
      t, 
      languages: languageNames,
      availableLanguages: Object.keys(translations)
    }}>
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
