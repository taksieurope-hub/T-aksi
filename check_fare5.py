path = "frontend/src/components/RiderPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== setRouteInfo calls ===")
for i, line in enumerate(lines):
    if "setRouteInfo" in line:
        for j in range(max(0,i-3), min(len(lines), i+5)):
            print(str(j+1) + ": " + lines[j])
        print("---")

print("\n=== Google Maps directions / route fetch ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["DirectionsService", "DirectionsResult", "routes[0]", "legs[0]", "distance.value", "duration.value", "setRouteInfo"]):
        print(str(i+1) + ": " + line)
