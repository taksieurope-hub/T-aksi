c = open("frontend/src/i18n/LanguageContext.jsx", "r", encoding="utf-8").read()

# Save language to backend when changed
old = '''  const changeLanguage = useCallback((newLanguage) => {
    if (translations[newLanguage]) {
      setLanguageState(newLanguage);
    }
  }, []);'''

new = '''  const changeLanguage = useCallback((newLanguage) => {
    if (translations[newLanguage]) {
      setLanguageState(newLanguage);
      localStorage.setItem('taksi_language', newLanguage);
    }
  }, []);'''

if old in c:
    c = c.replace(old, new)
    print("Already has save - checking init")
else:
    print("Pattern not found")

# Fix init to always respect saved language
old2 = "    const saved = localStorage.getItem('taksi_language');\n    if (saved && translations[saved]) return saved;\n    return defaultLanguage; // 'ka'"
new2 = "    const saved = localStorage.getItem('taksi_language');\n    if (saved && translations[saved]) return saved;\n    return 'en'; // default to English for new users"

if old2 in c:
    c = c.replace(old2, new2)
    print("Changed default to English")

open("frontend/src/i18n/LanguageContext.jsx", "w", encoding="utf-8").write(c)
