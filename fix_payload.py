path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '        paymentMethod,\n        \n        // ??? THE CRITICAL ADDITION: Pass the promo code to the server\n        promo_code: promoApplied ? "BETA15" : null, '
new = '        paymentMethod,\n        ...(paymentMethod === "corporate" && user?.corporate_account_id ? { corporate_account_id: user.corporate_account_id } : {}),\n        \n        // ??? THE CRITICAL ADDITION: Pass the promo code to the server\n        promo_code: promoApplied ? "BETA15" : null, '

if old in c:
    c = c.replace(old, new)
    print("OK: corporate_account_id added to ride request")
else:
    print("MISS: still not matching")
    # Debug: show what we have around paymentMethod
    idx = c.find('        paymentMethod,\n')
    print(repr(c[idx:idx+200]))

open(path, "w", encoding="utf-8", newline="\n").write(c)
