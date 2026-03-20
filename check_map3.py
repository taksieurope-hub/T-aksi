path = "frontend/src/components/maps/LiveTrackingMap.jsx"
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if "styles" in line or "color" in line.lower() and "styler" in line.lower():
        print(str(i+1) + ": " + line)
