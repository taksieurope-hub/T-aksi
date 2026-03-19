path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add import at top
old = "import { useState, useEffect, useRef, useCallback } from \"react\";"
new = "import { useState, useEffect, useRef, useCallback } from \"react\";\nimport { registerFCMToken } from \"@/lib/firebase\";"
if old in c:
    c = c.replace(old, new)
    print("OK: firebase import added to rider portal")
else:
    print("MISS: import - checking first import line")
    lines = c.splitlines()
    print(repr(lines[0]))

# Add FCM registration after user loads
old2 = "  useEffect(() => {\n    fetchUserData();\n  }, []);"
new2 = ("  useEffect(() => {\n    fetchUserData();\n  }, []);\n"
        "  useEffect(() => {\n"
        "    if (user?.id) {\n"
        "      registerFCMToken(api).catch(console.error);\n"
        "    }\n"
        "  }, [user?.id]);\n")
if old2 in c:
    c = c.replace(old2, new2)
    print("OK: FCM registration added to rider portal")
else:
    print("MISS: fetchUserData useEffect - will try alternate")
    for i, line in enumerate(c.splitlines()):
        if "fetchUserData" in line and "useEffect" in c.splitlines()[max(0,i-1)]:
            print(str(i) + ": " + line)

open(path, "w", encoding="utf-8", newline="\n").write(c)
