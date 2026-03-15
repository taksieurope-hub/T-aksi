import re

files = [
    "frontend/src/components/RiderPortal.jsx",
    "frontend/src/components/DriverPortal.jsx",
]

for path in files:
    c = open(path, "r", encoding="utf-8").read()
    if "usePushNotifications" not in c:
        c = c.replace(
            "import { useState, useEffect",
            'import { usePushNotifications } from "@/hooks/usePushNotifications";\nimport { useState, useEffect',
            1
        )
        open(path, "w", encoding="utf-8").write(c)
        print(f"Patched {path}")
    else:
        print(f"Already patched {path}")

# Add hook call in DriverDashboard
path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
if "usePushNotifications(user)" not in c:
    c = c.replace(
        "const DriverDashboard = () => {",
        "const DriverDashboard = () => {\n  usePushNotifications(user);",
        1
    )
    open(path, "w", encoding="utf-8").write(c)
    print("Added hook to DriverDashboard")
