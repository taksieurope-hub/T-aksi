path = "frontend/src/components/RiderPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== estimated_distance sent in ride request ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["estimated_distance", "estimatedDistance", "routeInfo", "distance_km", "distanceKm"]):
        print(str(i+1) + ": " + line)
