path = "frontend/src/components/DriverPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== complete ride call ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["complete", "completeRide", "finish_ride"]) and any(x in line for x in ["api.post", "axios", "fetch"]):
        for j in range(max(0,i-2), min(len(lines), i+15)):
            print(str(j+1) + ": " + lines[j])
        print("---")

print("\n=== actualDistance / final_distance / odometer tracking ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["actualDistance", "actual_distance", "final_distance", "distanceTraveled", "odometerKm", "totalDistance"]):
        print(str(i+1) + ": " + line)

print("\n=== update-tracking endpoint call ===")
for i, line in enumerate(lines):
    if "update-tracking" in line or "updateTracking" in line:
        for j in range(max(0,i-2), min(len(lines), i+10)):
            print(str(j+1) + ": " + lines[j])
        print("---")
