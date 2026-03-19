import re

changes = []

# ── RIDER PORTAL ──────────────────────────────────────────────
path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = 'import { sendFirebaseOTP, verifyFirebaseOTP } from "@/hooks/useFirebasePhoneAuth";'
new = 'import { sendFirebaseOTP, verifyFirebaseOTP } from "@/hooks/useFirebasePhoneAuth";\nimport SupportChatWidget from "@/components/SupportChatWidget";'
if old in c:
    c = c.replace(old, new)
    changes.append("OK: SupportChatWidget imported in RiderPortal")
else:
    changes.append("MISS: rider import")

# Inject widget just before closing of main return
old2 = "export default RiderPortal;"
new2 = "export default RiderPortal;"
# Find the last </> or </div> before export default
idx = c.rfind("export default RiderPortal;")
# Find the RiderDashboard return - inject before its closing
old3 = "    </>\n  );\n};\n\nexport default RiderPortal;"
new3 = "    </>\n  );\n};\n\nexport default RiderPortal;"
# Simpler: find the root Routes wrapper closing
if "<SupportChatWidget" not in c:
    # inject before last </> in the main component
    last_close = c.rfind("    </>\n  );\n};")
    if last_close != -1:
        insert_at = c.rfind("\n    </>", 0, last_close + 10)
        if insert_at != -1:
            c = c[:insert_at] + "\n      <SupportChatWidget />" + c[insert_at:]
            changes.append("OK: SupportChatWidget injected in RiderPortal")
        else:
            changes.append("MISS: injection point in rider")
    else:
        changes.append("MISS: closing tag in rider")
else:
    changes.append("SKIP: already in rider")

open(path, "w", encoding="utf-8", newline="\n").write(c)

# ── DRIVER PORTAL ─────────────────────────────────────────────
path2 = "frontend/src/components/DriverPortal.jsx"
c2 = open(path2, "r", encoding="utf-8").read()

old4 = 'import { useState, useEffect, useRef, useCallback } from "react";\nimport { registerFCMToken } from "@/lib/firebase";'
new4 = 'import { useState, useEffect, useRef, useCallback } from "react";\nimport { registerFCMToken } from "@/lib/firebase";\nimport SupportChatWidget from "@/components/SupportChatWidget";'
if old4 in c2:
    c2 = c2.replace(old4, new4)
    changes.append("OK: SupportChatWidget imported in DriverPortal")
else:
    changes.append("MISS: driver import")

if "<SupportChatWidget" not in c2:
    last_close = c2.rfind("    </>\n  );\n};")
    if last_close != -1:
        insert_at = c2.rfind("\n    </>", 0, last_close + 10)
        if insert_at != -1:
            c2 = c2[:insert_at] + "\n      <SupportChatWidget />" + c2[insert_at:]
            changes.append("OK: SupportChatWidget injected in DriverPortal")
        else:
            changes.append("MISS: injection point in driver")
    else:
        changes.append("MISS: closing tag in driver")
else:
    changes.append("SKIP: already in driver")

open(path2, "w", encoding="utf-8", newline="\n").write(c2)

print("\n".join(changes))
