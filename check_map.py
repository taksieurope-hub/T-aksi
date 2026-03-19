path = "frontend/src/components/DriverPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== MAP_STYLES (first 80 lines of styles array) ===")
in_styles = False
count = 0
for i, line in enumerate(lines):
    if "MAP_STYLES" in line and "const" in line:
        in_styles = True
    if in_styles:
        print(str(i+1) + ": " + line)
        count += 1
        if count > 80: break

print("\n=== HEADING / BEARING / ROTATION ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["heading", "bearing", "rotation", "animateHeading", "setHeading"]):
        print(str(i+1) + ": " + line)
