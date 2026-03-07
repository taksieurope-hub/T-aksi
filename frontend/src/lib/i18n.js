export const DEFAULT_LANGUAGE = "en";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
];

const SUPPORTED_LANGUAGE_SET = new Set(
  SUPPORTED_LANGUAGES.map((language) => language.code),
);

const RTL_LANGUAGES = new Set(["ar"]);

const TRANSLATIONS = {
  en: {
    headline: "Building something incredible ~!",
    description: "Your app now adapts to each user's language preference.",
    languageLabel: "Language",
    backendStatusLabel: "Backend greeting",
    loading: "Loading greeting...",
    backendError: "We could not load the backend greeting right now.",
  },
  es: {
    headline: "¡Construyendo algo increíble ~!",
    description: "Tu app ahora se adapta al idioma preferido de cada usuario.",
    languageLabel: "Idioma",
    backendStatusLabel: "Saludo del backend",
    loading: "Cargando saludo...",
    backendError: "No pudimos cargar el saludo del backend ahora.",
  },
  fr: {
    headline: "Créons quelque chose d'incroyable ~!",
    description: "Votre application s'adapte maintenant à la langue préférée de chaque utilisateur.",
    languageLabel: "Langue",
    backendStatusLabel: "Message du backend",
    loading: "Chargement du message...",
    backendError: "Impossible de charger le message backend pour le moment.",
  },
  de: {
    headline: "Wir bauen etwas Großartiges ~!",
    description: "Deine App passt sich jetzt der bevorzugten Sprache jedes Nutzers an.",
    languageLabel: "Sprache",
    backendStatusLabel: "Backend-Begrüßung",
    loading: "Begrüßung wird geladen...",
    backendError: "Die Backend-Begrüßung konnte aktuell nicht geladen werden.",
  },
  pt: {
    headline: "Construindo algo incrível ~!",
    description: "Seu app agora se adapta ao idioma preferido de cada usuário.",
    languageLabel: "Idioma",
    backendStatusLabel: "Saudação do backend",
    loading: "Carregando saudação...",
    backendError: "Não foi possível carregar a saudação do backend agora.",
  },
  hi: {
    headline: "कुछ शानदार बना रहे हैं ~!",
    description: "अब आपका ऐप हर यूज़र की भाषा पसंद के अनुसार बदलता है।",
    languageLabel: "भाषा",
    backendStatusLabel: "बैकएंड संदेश",
    loading: "संदेश लोड हो रहा है...",
    backendError: "अभी बैकएंड संदेश लोड नहीं हो पाया।",
  },
  ar: {
    headline: "نبني شيئًا مذهلًا ~!",
    description: "يتكيف تطبيقك الآن مع اللغة المفضلة لكل مستخدم.",
    languageLabel: "اللغة",
    backendStatusLabel: "رسالة الخادم",
    loading: "جارٍ تحميل الرسالة...",
    backendError: "تعذر تحميل رسالة الخادم الآن.",
  },
  zh: {
    headline: "正在打造令人惊叹的作品 ~!",
    description: "你的应用现在会根据每位用户的语言偏好自动切换。",
    languageLabel: "语言",
    backendStatusLabel: "后端问候语",
    loading: "正在加载问候语...",
    backendError: "当前无法加载后端问候语。",
  },
};

export const normalizeLanguageCode = (rawLanguageCode) => {
  if (!rawLanguageCode || typeof rawLanguageCode !== "string") {
    return DEFAULT_LANGUAGE;
  }

  const preferredLanguage = rawLanguageCode
    .split(",")[0]
    .trim()
    .toLowerCase()
    .split("-")[0];

  return SUPPORTED_LANGUAGE_SET.has(preferredLanguage)
    ? preferredLanguage
    : DEFAULT_LANGUAGE;
};

export const getTranslation = (rawLanguageCode) => {
  const languageCode = normalizeLanguageCode(rawLanguageCode);
  return TRANSLATIONS[languageCode] ?? TRANSLATIONS[DEFAULT_LANGUAGE];
};

export const getDirection = (rawLanguageCode) => {
  const languageCode = normalizeLanguageCode(rawLanguageCode);
  return RTL_LANGUAGES.has(languageCode) ? "rtl" : "ltr";
};

