path = "frontend/src/components/DriverPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== distanceTraveled accumulation ===")
for i, line in enumerate(lines):
    if "distanceTraveled" in line or "setDistanceTraveled" in line:
        for j in range(max(0,i-2), min(len(lines), i+6)):
            print(str(j+1) + ": " + lines[j])
        print("---")
