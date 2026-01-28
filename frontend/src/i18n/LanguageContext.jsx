import { createContext, useContext, useState, useEffect } from "react";

// Translations
const translations = {
  en: {
    "app_name": "T'aksi",
    "welcome": "Welcome",
    // ... add defaults or keep empty, logic handles missing keys
  },
  ge: {
    "app_name": "ტაქსი",
    "welcome": "მოგესალმებით",
  }
};

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    const saved = localStorage.getItem("taksi_language");
    if (saved) setLanguage(saved);
  }, []);

  const t = (key) => {
    return translations[language]?.[key] || key;
  };

  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem("taksi_language", lang);
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);