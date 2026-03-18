path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

changes = []

# 1. Add TermsAndConditions import
old = 'import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";'
new = 'import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";\nimport TermsAndConditions from "@/components/TermsAndConditions";'
if old in c:
    c = c.replace(old, new)
    changes.append("TermsAndConditions import")

# 2. Add savedCards state
old = '  const [paymentMethod, setPaymentMethod] = useState("cash");'
new = '  const [paymentMethod, setPaymentMethod] = useState("cash");\n  const [savedCards, setSavedCards] = useState([]);\n  const [selectedVaultId, setSelectedVaultId] = useState(null);'
if old in c:
    c = c.replace(old, new)
    changes.append("savedCards state")

# 3. Load saved cards on mount
old = '  const { user, logout, refreshUser } = useAuth();'
new = '  const { user, logout, refreshUser } = useAuth();\n\n  useEffect(() => {\n    api.get("/rider/saved-cards").then(r => setSavedCards(r.data.saved_cards || [])).catch(() => {});\n  }, [user?.id]);'
if old in c:
    c = c.replace(old, new)
    changes.append("saved cards loader")

# 4. handleBookRide async
old = '  const handleBookRide = () => {'
new = '  const handleBookRide = async () => {'
if old in c:
    c = c.replace(old, new)
    changes.append("handleBookRide async")

# 5. Terms state in RiderAuth
old = 'const RiderAuth = () => {\n  const { t } = useLanguage();\n  const [isLogin, setIsLogin] = useState(true);'
new = 'const RiderAuth = () => {\n  const { t } = useLanguage();\n  const [isLogin, setIsLogin] = useState(true);\n  const [showTerms, setShowTerms] = useState(false);\n  const [termsAccepted, setTermsAccepted] = useState(false);'
if old in c:
    c = c.replace(old, new)
    changes.append("terms state in RiderAuth")

# 6. Terms guard before register
old = '        const res = await api.post("/auth/register/rider", formData, {'
new = '        if (!termsAccepted) { toast.error("Please accept the Terms & Conditions to continue"); return; }\n        const res = await api.post("/auth/register/rider", formData, {'
if old in c:
    c = c.replace(old, new)
    changes.append("terms guard")

# 7. Cancellation fee warning
old = '    if (!activeRide) return;\n    try {\n      await api.post(`/rides/${activeRide.id}/cancel`);\n      toast.success("Ride cancelled");\n      setActiveRide(null);\n      setActiveTab("book");\n      if (refreshUser) refreshUser();\n    } catch { toast.error("Failed to cancel"); }\n  };'
new = '    if (!activeRide) return;\n    if (activeRide.status === "arrived") {\n      const confirmed = window.confirm("\u26a0\ufe0f The driver has already arrived. A GEL 3.00 no-show fee will be charged to your wallet. Cancel anyway?");\n      if (!confirmed) return;\n    }\n    try {\n      const res = await api.post(`/rides/${activeRide.id}/cancel`);\n      if (res.data?.cancellation_fee > 0) {\n        toast.error(`Ride cancelled. GEL ${res.data.cancellation_fee.toFixed(2)} no-show fee charged.`);\n      } else {\n        toast.success("Ride cancelled");\n      }\n      setActiveRide(null);\n      setActiveTab("book");\n      if (refreshUser) refreshUser();\n    } catch { toast.error("Failed to cancel"); }\n  };'
if old in c:
    c = c.replace(old, new)
    changes.append("cancellation fee warning")

# 8. Saved card one-tap charge
old = '    if (paymentMethod === "card") { setShowPayPal(true); return; }'
new = '    if (paymentMethod === "card") {\n      if (selectedVaultId) {\n        try {\n          const amount = fareEstimate?.total ?? calculateFare(carType, routeInfo?.distance ?? 5, 0, 0, validStopsCount, surgeInfo?.multiplier ?? 1.0, "card").total;\n          setLoading(true);\n          const chargeRes = await api.post("/rider/charge-saved-card", {\n            vault_id: selectedVaultId,\n            amount_gel: amount,\n            description: `T\'aksi ride - ${carType}`,\n          });\n          const orderId = chargeRes.data.order_id;\n          await processRideRequest(orderId, selectedVaultId, savedCards.find(c => c.vault_id === selectedVaultId)?.last4 || null, savedCards.find(c => c.vault_id === selectedVaultId)?.brand || null);\n        } catch (e) {\n          setLoading(false);\n          toast.error(e.response?.data?.detail || "Card charge failed.");\n        }\n        return;\n      }\n      setShowPayPal(true); return;\n    }'
if old in c:
    c = c.replace(old, new)
    changes.append("one-tap card charge")

print("Applied:", changes)
print("Missing:", [c for c in ["TermsAndConditions import","savedCards state","saved cards loader","handleBookRide async","terms state in RiderAuth","terms guard","cancellation fee warning","one-tap card charge"] if c not in changes])

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Saved!")
