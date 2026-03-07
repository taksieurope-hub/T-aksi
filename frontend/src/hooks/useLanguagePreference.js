import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LANGUAGE,
  getDirection,
  normalizeLanguageCode,
} from "@/lib/i18n";

const STORAGE_KEY = "preferred_language";

const resolveBrowserLanguage = () => {
  if (typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const browserLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const candidateLanguage of browserLanguages) {
    const normalizedLanguage = normalizeLanguageCode(candidateLanguage);

    if (normalizedLanguage) {
      return normalizedLanguage;
    }
  }

  return DEFAULT_LANGUAGE;
};

const resolveInitialLanguage = () => {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const storedLanguage = window.localStorage.getItem(STORAGE_KEY);

  if (storedLanguage) {
    return normalizeLanguageCode(storedLanguage);
  }

  return resolveBrowserLanguage();
};

export const useLanguagePreference = () => {
  const [language, setLanguageState] = useState(resolveInitialLanguage);
  const direction = useMemo(() => getDirection(language), [language]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  const setLanguage = (nextLanguageCode) => {
    setLanguageState(normalizeLanguageCode(nextLanguageCode));
  };

  return {
    language,
    setLanguage,
    isRtl: direction === "rtl",
  };
};

