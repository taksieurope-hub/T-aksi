path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add import at top
old_import = 'import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";'
new_import = 'import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";\nimport TermsAndConditions from "@/components/TermsAndConditions";'

if old_import in c:
    c = c.replace(old_import, new_import)
    print("OK: import added to RiderPortal")
else:
    print("MISS: import")

open(path, "w", encoding="utf-8").write(c)
