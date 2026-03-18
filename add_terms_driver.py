path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Import
old_imp = 'import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";'
new_imp = 'import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";\nimport TermsAndConditions from "@/components/TermsAndConditions";'
if old_imp in c:
    c = c.replace(old_imp, new_imp)
    print("OK: import")
else:
    print("MISS: import")

# Terms guard before register call
old_reg = '        if (!phoneToken) return toast.error("Please verify your phone number first");\n        const r = await api.post("/auth/register/driver", form, {'
new_reg = '        if (!phoneToken) return toast.error("Please verify your phone number first");\n        if (!termsAccepted) { toast.error("Please accept the Terms & Conditions to continue"); return; }\n        const r = await api.post("/auth/register/driver", form, {'
if old_reg in c:
    c = c.replace(old_reg, new_reg)
    print("OK: guard")
else:
    print("MISS: guard")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
