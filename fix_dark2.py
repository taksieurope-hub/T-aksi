files = [
    "frontend/src/components/RideCommunication.jsx",
    "frontend/src/components/RiderPortal.jsx",
    "frontend/src/components/maps/LiveTrackingMap.jsx",
]
for path in files:
    c = open(path, encoding="utf-8").read()
    orig = c
    c = c.replace("#0d0d1a", "#1a1a2e")
    c = c.replace("#1f2937", "#4a5568")
    c = c.replace("#6b7280", "#ffffff")
    c = c.replace("#9ca3af", "#ffffff")
    c = c.replace("#111827", "#0e1626")
    if c != orig:
        open(path, "w", encoding="utf-8").write(c)
        print("Fixed: " + path)
    else:
        print("No changes: " + path)
