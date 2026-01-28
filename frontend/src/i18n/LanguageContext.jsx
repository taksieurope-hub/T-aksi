import { createContext, useContext, useState, useEffect } from 'react';
import { translations, defaultLanguage, languageNames } from './translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // 1. Check if user already picked a language before
    const saved = localStorage.getItem('taksi_language');
    if (saved && translations[saved]) return saved;
    
    // 2. FORCE GEORGIAN DEFAULT (Ignore phone settings)
    return "ka"; 
  });

  useEffect(() => {
    localStorage.setItem('taksi_language', language);
    document.documentElement.lang = language;
  }, [language]);

  const t = (key) => {
    return translations[language]?.[key] || translations.en?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ 
      language, 
      setLanguage, 
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
  if (!context) throw new Error('useLanguage error');
  return context;
};

export default LanguageContext;