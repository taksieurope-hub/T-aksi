path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Add import after first line
old = 'import { sendFirebaseOTP, verifyFirebaseOTP } from "@/hooks/useFirebasePhoneAuth";'
new = 'import { sendFirebaseOTP, verifyFirebaseOTP } from "@/hooks/useFirebasePhoneAuth";\nimport { registerFCMToken } from "@/lib/firebase";'
if old in c:
    c = c.replace(old, new)
    changes.append("OK: firebase import added")
else:
    changes.append("MISS: import")

# Add FCM registration alongside the saved-cards useEffect
old2 = '  useEffect(() => {\n    api.get("/rider/saved-cards").then(r => setSavedCards(r.data.saved_cards || [])).catch(() => {});\n  }, [user?.id]);'
new2 = ('  useEffect(() => {\n'
        '    api.get("/rider/saved-cards").then(r => setSavedCards(r.data.saved_cards || [])).catch(() => {});\n'
        '    if (user?.id) registerFCMToken(api).catch(console.error);\n'
        '  }, [user?.id]);')
if old2 in c:
    c = c.replace(old2, new2)
    changes.append("OK: FCM registration added to rider portal")
else:
    changes.append("MISS: useEffect")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
