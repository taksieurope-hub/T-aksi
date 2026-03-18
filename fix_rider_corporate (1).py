path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
changes = []

# FIX 1: Add Business to payment options array
old = '                  { val: "card",   label: t("card"),   Icon: CreditCard },\n                ].map'
new = (
    '                  { val: "card",   label: t("card"),   Icon: CreditCard },\n'
    '                  ...(user?.corporate_account_id ? [{ val: "corporate", label: "Business", subLabel: user.corporate_company_name || "Corporate", Icon: null }] : []),\n'
    '                ].map'
)
if old in c:
    c = c.replace(old, new)
    changes.append("OK: Business payment option added")
else:
    changes.append("MISS: payment array")

# FIX 2: Add corporate_account_id to ride request payload
old2 = '        paymentMethod,\n\n        // ??? THE CRITICAL ADDITION: Pass the promo code to the server\n        promo_code: promoApplied ? "BETA15" : null,'
new2 = (
    '        paymentMethod,\n'
    '        ...(paymentMethod === "corporate" && user?.corporate_account_id ? { corporate_account_id: user.corporate_account_id } : {}),\n'
    '\n'
    '        // ??? THE CRITICAL ADDITION: Pass the promo code to the server\n'
    '        promo_code: promoApplied ? "BETA15" : null,'
)
if old2 in c:
    c = c.replace(old2, new2)
    changes.append("OK: corporate_account_id added to ride request")
else:
    changes.append("MISS: ride request payload")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
