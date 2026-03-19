path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add import
old = 'import { useState, useEffect, useRef, useCallback } from "react";'
new = 'import { useState, useEffect, useRef, useCallback } from "react";\nimport { registerFCMToken } from "@/lib/firebase";'
if old in c:
    c = c.replace(old, new)
    print("OK: firebase import added to driver portal")
else:
    print("MISS: import")

# Add FCM registration in useEffect on mount
old2 = '  useEffect(() => { fetchActiveRide(); fetchRideHistory(); }, []);'
new2 = ('  useEffect(() => { fetchActiveRide(); fetchRideHistory(); }, []);\n'
        '  useEffect(() => {\n'
        '    if (user?.id) {\n'
        '      registerFCMToken(api).catch(console.error);\n'
        '    }\n'
        '  }, [user?.id]);\n')
if old2 in c:
    c = c.replace(old2, new2)
    print("OK: FCM registration added to driver portal")
else:
    print("MISS: useEffect")

open(path, "w", encoding="utf-8", newline="\n").write(c)
