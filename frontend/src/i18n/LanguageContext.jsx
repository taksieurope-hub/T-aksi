import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations, defaultLanguage, languageNames } from './translations';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem('taksi_language');
    if (saved && translations[saved]) return saved;
    return defaultLanguage;
  });

  const [renderKey, setRenderKey] = useState(0);

  const t = useCallback((key) => {
    return translations[language]?.[key] || translations.en?.[key] || key;
  }, [language]);

  useEffect(() => {
    localStorage.setItem('taksi_language', language);
    document.documentElement.lang = language;
    // 🚀 THE RESET TRIGGER: Changes the key to force a full app re-mount
    setRenderKey(prev => prev + 1);
  }, [language]);

  const changeLanguage = (lang) => {
    if (translations[lang]) setLanguageState(lang);
  };

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