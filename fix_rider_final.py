path = 'frontend/src/components/RiderPortal.jsx'
c = open(path, 'r', encoding='utf-8').read()
changes = []

# 1. Add TermsAndConditions import
old = 'import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";'
new = 'import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";\nimport TermsAndConditions from "@/components/TermsAndConditions";'
if old in c and 'TermsAndConditions' not in c:
    c = c.replace(old, new)
    changes.append('TC import')

# 2. Add terms state inside RiderAuth
old = 'const RiderAuth = () => {\n  const { login } = useAuth();\n  const navigate  = useNavigate();\n  const { t }     = useLanguage();\n  const [isLogin, setIsLogin]   = useState(true);'
new = 'const RiderAuth = () => {\n  const { login } = useAuth();\n  const navigate  = useNavigate();\n  const { t }     = useLanguage();\n  const [isLogin, setIsLogin]   = useState(true);\n  const [showTerms, setShowTerms] = useState(false);\n  const [termsAccepted, setTermsAccepted] = useState(false);'
if old in c:
    c = c.replace(old, new)
    changes.append('terms state')

# 3. Terms guard before register
old = '        const res = await api.post("/auth/register/rider", formData, {'
new = '        if (!termsAccepted) { toast.error("Please accept the Terms & Conditions to continue"); return; }\n        const res = await api.post("/auth/register/rider", formData, {'
if old in c and 'termsAccepted' not in c.split('register/rider')[0].split('\n')[-1]:
    c = c.replace(old, new)
    changes.append('terms guard')

# 4. Remove surge fetch on mount (only the bare call, not the gated one)
old = '    fetchSurgeStatus();\n'
new = '    // surge fetch removed from mount - only triggers when pickup is set\n'
if old in c:
    c = c.replace(old, new, 1)
    changes.append('surge mount removed')

print('Applied:', changes)
open(path, 'w', encoding='utf-8', newline='\n').write(c)
print('Saved!')
